import ActivityKit
import SwiftUI
import WidgetKit

private let rescueOrange = Color(red: 0.98, green: 0.45, blue: 0.09)
private let rescueBackground = Color(red: 0.04, green: 0.04, blue: 0.05)

@main
struct CustomerRescueWidgetBundle: WidgetBundle {
  var body: some Widget { CustomerRescueWidget() }
}

struct CustomerRescueWidget: Widget {
  var body: some WidgetConfiguration {
    ActivityConfiguration(for: CustomerRescueAttributes.self) { context in
      VStack(alignment: .leading, spacing: 12) {
        HStack {
          Label("TYRE RESCUE", systemImage: "car.side.fill")
            .font(.caption.weight(.bold)).foregroundStyle(rescueOrange)
          Spacer()
          Text(context.attributes.refNumber).font(.caption2).foregroundStyle(.secondary)
        }
        HStack(alignment: .center, spacing: 14) {
          VStack(alignment: .leading, spacing: 4) {
            Text(title(context)).font(.headline).foregroundStyle(.white)
            if isOutdated(context) {
              Text("Open the app for the latest update").font(.caption).foregroundStyle(.secondary)
            } else if !context.state.driverName.isEmpty {
              Text("Your fitter: \(context.state.driverName)").font(.caption).foregroundStyle(.secondary)
            }
          }
          Spacer(minLength: 0)
          if let arrival = arrivalDate(context) {
            VStack(alignment: .trailing, spacing: 3) {
              Text(arrival, style: .time).font(.title2.weight(.bold)).monospacedDigit().foregroundStyle(rescueOrange)
              Text("Expected arrival").font(.caption2).foregroundStyle(.secondary)
            }
          }
        }
      }
      .padding(16)
      .activityBackgroundTint(rescueBackground)
      .activitySystemActionForegroundColor(.white)
      .widgetURL(bookingURL(context.attributes.refNumber))
    } dynamicIsland: { context in
      DynamicIsland {
        DynamicIslandExpandedRegion(.leading) {
          Label("Tyre Rescue", systemImage: "car.side.fill").foregroundStyle(rescueOrange).font(.caption.weight(.bold))
        }
        DynamicIslandExpandedRegion(.trailing) {
          if let arrival = arrivalDate(context) { Text(arrival, style: .time).monospacedDigit().foregroundStyle(rescueOrange) }
        }
        DynamicIslandExpandedRegion(.bottom) {
          VStack(alignment: .leading, spacing: 4) {
            Text(title(context)).font(.headline)
            Text(isOutdated(context) ? "Open the app for the latest update" : "Tap to view your rescue")
              .font(.caption).foregroundStyle(.secondary)
          }.frame(maxWidth: .infinity, alignment: .leading)
        }
      } compactLeading: {
        Image(systemName: "car.side.fill").foregroundStyle(rescueOrange)
      } compactTrailing: {
        if let arrival = arrivalDate(context) {
          Text(arrival, style: .time).font(.caption2).monospacedDigit().foregroundStyle(rescueOrange)
        } else {
          Image(systemName: isOutdated(context) ? "arrow.clockwise" : statusIcon(context.state.status)).foregroundStyle(rescueOrange)
        }
      } minimal: {
        Image(systemName: statusIcon(context.state.status)).foregroundStyle(rescueOrange)
      }
      .widgetURL(bookingURL(context.attributes.refNumber))
      .keylineTint(rescueOrange)
    }
  }

  private func isOutdated(_ context: ActivityViewContext<CustomerRescueAttributes>) -> Bool {
    context.isStale || context.state.staleAt <= Date().timeIntervalSince1970
  }

  private func arrivalDate(_ context: ActivityViewContext<CustomerRescueAttributes>) -> Date? {
    guard !isOutdated(context), context.state.status == "en_route",
      let value = context.state.estimatedArrivalAt, value > Date().timeIntervalSince1970 else { return nil }
    return Date(timeIntervalSince1970: value)
  }

  private func title(_ context: ActivityViewContext<CustomerRescueAttributes>) -> String {
    if isOutdated(context) { return "Waiting for an update" }
    switch context.state.status {
    case "en_route": return "Your fitter is on the way"
    case "arrived": return "Your fitter has arrived"
    case "in_progress": return "Your tyre service is underway"
    case "completed": return "Your tyre service is complete"
    case "cancelled": return "Your booking was cancelled"
    case "cancelled_refund_pending": return "Cancelled — refund in progress"
    case "refunded": return "Your booking was refunded"
    case "refunded_partial": return "Your booking was partially refunded"
    default: return "Your rescue has been updated"
    }
  }

  private func statusIcon(_ status: String) -> String {
    switch status {
    case "arrived": return "mappin.circle.fill"
    case "in_progress": return "wrench.and.screwdriver.fill"
    case "completed": return "checkmark.circle.fill"
    case "cancelled", "cancelled_refund_pending": return "xmark.circle.fill"
    case "refunded", "refunded_partial": return "arrow.uturn.backward.circle.fill"
    default: return "car.side.fill"
    }
  }

  private func bookingURL(_ reference: String) -> URL? {
    var parts = URLComponents()
    parts.scheme = "tyrerescue"
    parts.host = "track"
    parts.queryItems = [URLQueryItem(name: "ref", value: reference)]
    return parts.url
  }
}
