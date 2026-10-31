import ActivityKit
import Foundation

// This exact file is also compiled into the WidgetKit extension by the config plugin.
@available(iOS 16.2, *)
struct CustomerRescueAttributes: ActivityAttributes {
  struct ContentState: Codable, Hashable {
    var status: String
    var driverName: String
    var estimatedArrivalAt: Double?
    var updatedAt: Double
    var staleAt: Double
  }

  var refNumber: String
}
