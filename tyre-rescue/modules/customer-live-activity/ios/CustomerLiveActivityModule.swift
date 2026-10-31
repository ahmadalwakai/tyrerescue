import ActivityKit
import ExpoModulesCore
import Foundation
import UIKit

struct RescueStateRecord: Record {
  @Field var status: String = "en_route"
  @Field var driverName: String = ""
  @Field var estimatedArrivalAt: Double?
  @Field var updatedAt: Double = 0
  @Field var staleAt: Double = 0

  @available(iOS 16.2, *)
  func content() throws -> ActivityContent<CustomerRescueAttributes.ContentState> {
    guard updatedAt.isFinite, staleAt.isFinite,
      estimatedArrivalAt == nil || estimatedArrivalAt!.isFinite else {
      throw NSError(domain: "CustomerLiveActivity", code: 1, userInfo: [NSLocalizedDescriptionKey: "Invalid journey update."])
    }
    let state = CustomerRescueAttributes.ContentState(
      status: status,
      driverName: String(driverName.split(separator: " ").first ?? "").prefix(50).description,
      estimatedArrivalAt: status == "en_route" ? estimatedArrivalAt : nil,
      updatedAt: updatedAt,
      staleAt: staleAt
    )
    return ActivityContent(state: state, staleDate: Date(timeIntervalSince1970: staleAt))
  }
}

@available(iOS 16.2, *)
@MainActor
private final class RescueActivityManager {
  static let shared = RescueActivityManager()
  private var tokenTasks: [String: Task<Void, Never>] = [:]
  private var notify: (([String: Any]) -> Void)?

  private var environment: String {
    // Development and ad-hoc builds can use a different signing environment from
    // their Debug/Release configuration. Read the embedded profile when present;
    // App Store installations may omit it and use the production build fallback.
    if let url = Bundle.main.url(forResource: "embedded", withExtension: "mobileprovision"),
      let data = try? Data(contentsOf: url),
      let source = String(data: data, encoding: .isoLatin1),
      let start = source.range(of: "<?xml"),
      let finish = source.range(of: "</plist>", range: start.lowerBound..<source.endIndex),
      let xml = String(source[start.lowerBound..<finish.upperBound]).data(using: .isoLatin1),
      let profile = (try? PropertyListSerialization.propertyList(from: xml, options: [], format: nil)) as? [String: Any],
      let entitlements = profile["Entitlements"] as? [String: Any],
      let value = entitlements["aps-environment"] as? String,
      ["development", "production"].contains(value) {
      return value == "development" ? "sandbox" : "production"
    }
    return Bundle.main.object(forInfoDictionaryKey: "CustomerLiveActivityPushEnvironment") as? String == "sandbox" ? "sandbox" : "production"
  }

  func observe(_ callback: @escaping ([String: Any]) -> Void) {
    notify = callback
    for activity in Activity<CustomerRescueAttributes>.activities { watch(activity) }
  }

  func stopObserving() {
    notify = nil
    for task in tokenTasks.values { task.cancel() }
    tokenTasks.removeAll()
  }

  private func details(_ activity: Activity<CustomerRescueAttributes>, token: Data? = nil) -> [String: Any] {
    let encoded = (token ?? activity.pushToken)?.map { String(format: "%02x", $0) }.joined()
    return ["refNumber": activity.attributes.refNumber, "activityId": activity.id,
      "pushToken": encoded as Any? ?? NSNull(), "environment": environment]
  }

  private func watch(_ activity: Activity<CustomerRescueAttributes>) {
    guard tokenTasks[activity.id] == nil else { return }
    tokenTasks[activity.id] = Task { @MainActor [weak self] in
      for await token in activity.pushTokenUpdates {
        guard !Task.isCancelled, let self else { return }
        self.notify?(self.details(activity, token: token))
      }
      self?.tokenTasks.removeValue(forKey: activity.id)
    }
  }

  func activities() -> [[String: Any]] {
    Activity<CustomerRescueAttributes>.activities
      .filter { $0.activityState == .active || $0.activityState == .stale }
      .map { activity in watch(activity); return details(activity) }
  }

  func startOrUpdate(refNumber: String, state: RescueStateRecord) async throws {
    guard refNumber.range(of: "^[A-Za-z0-9-]{3,40}$", options: .regularExpression) != nil else {
      throw NSError(domain: "CustomerLiveActivity", code: 2, userInfo: [NSLocalizedDescriptionKey: "Invalid booking reference."])
    }
    let content = try state.content()
    let current = Activity<CustomerRescueAttributes>.activities.filter {
      $0.attributes.refNumber == refNumber && ($0.activityState == .active || $0.activityState == .stale)
    }
    if let activity = current.first {
      guard content.state.updatedAt >= activity.content.state.updatedAt else { return }
      await activity.update(content)
      watch(activity)
      // Recover from an interrupted previous launch without leaving duplicates.
      for duplicate in current.dropFirst() { await duplicate.end(nil, dismissalPolicy: .immediate) }
      return
    }
    guard state.status == "en_route", UIApplication.shared.applicationState == .active,
      ActivityAuthorizationInfo().areActivitiesEnabled else { return }
    let activity = try Activity<CustomerRescueAttributes>.request(
      attributes: CustomerRescueAttributes(refNumber: refNumber), content: content, pushType: .token
    )
    watch(activity)
    if activity.pushToken != nil { notify?(details(activity)) }
  }

  func end(refNumber: String, state: RescueStateRecord?) async throws {
    let content = try state?.content()
    for activity in Activity<CustomerRescueAttributes>.activities where activity.attributes.refNumber == refNumber {
      await activity.end(content, dismissalPolicy: .immediate)
      tokenTasks.removeValue(forKey: activity.id)?.cancel()
    }
  }

  func endAll() async {
    for activity in Activity<CustomerRescueAttributes>.activities {
      await activity.end(nil, dismissalPolicy: .immediate)
      tokenTasks.removeValue(forKey: activity.id)?.cancel()
    }
  }
}

public final class CustomerLiveActivityModule: Module {
  public func definition() -> ModuleDefinition {
    Name("CustomerLiveActivity")
    Events("onPushToken")

    AsyncFunction("isSupported") { () -> Bool in
      if #available(iOS 16.2, *) { return ActivityAuthorizationInfo().areActivitiesEnabled }
      return false
    }
    AsyncFunction("getActivities") { () async -> [[String: Any]] in
      if #available(iOS 16.2, *) { return await RescueActivityManager.shared.activities() }
      return []
    }
    AsyncFunction("startOrUpdate") { (refNumber: String, state: RescueStateRecord) async throws in
      if #available(iOS 16.2, *) { try await RescueActivityManager.shared.startOrUpdate(refNumber: refNumber, state: state) }
    }
    AsyncFunction("end") { (refNumber: String, state: RescueStateRecord?) async throws in
      if #available(iOS 16.2, *) { try await RescueActivityManager.shared.end(refNumber: refNumber, state: state) }
    }
    AsyncFunction("endAll") { () async in
      if #available(iOS 16.2, *) { await RescueActivityManager.shared.endAll() }
    }
    OnStartObserving {
      if #available(iOS 16.2, *) {
        Task { @MainActor [weak self] in
          RescueActivityManager.shared.observe { [weak self] event in self?.sendEvent("onPushToken", event) }
        }
      }
    }
    OnStopObserving {
      if #available(iOS 16.2, *) { Task { @MainActor in RescueActivityManager.shared.stopObserving() } }
    }
  }
}
