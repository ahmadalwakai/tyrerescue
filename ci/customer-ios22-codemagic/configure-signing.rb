require 'json'
require 'xcodeproj'
require 'pathname'

app = File.join(ENV.fetch('CM_BUILD_DIR'), ENV.fetch('CUSTOMER_APP_DIR'))
metadata = JSON.parse(File.read(File.join(ENV.fetch('CUSTOMER_CI_TEMP'), 'customer-ios22-signing', 'metadata.json')))
projects = Dir.glob(File.join(app, 'ios', '*.xcodeproj'))
raise 'Expected exactly one native app project' unless projects.length == 1
project = Xcodeproj::Project.open(projects.first)
targets = project.targets.select { |target| target.product_type == 'com.apple.product-type.application' }
raise 'Expected exactly one application target' unless targets.length == 1
profiles = metadata.fetch('profiles') { { metadata.fetch('bundle') => metadata } }
expected_bundles = ['uk.tyrerescue.customer', 'uk.tyrerescue.customer.liveactivity']
raise 'Unexpected provisioning scope' unless (profiles.keys - expected_bundles).empty?
raise 'Unexpected extra native target' unless project.targets.length == profiles.length
target = targets.first
project.targets.each do |signing_target|
  is_app = signing_target == target
  raise 'Unexpected extension target' unless is_app || (signing_target.name == 'CustomerRescueLiveActivity' && signing_target.product_type == 'com.apple.product-type.app-extension')
  expected_bundle = is_app ? metadata.fetch('bundle') : 'uk.tyrerescue.customer.liveactivity'
  profile = profiles.fetch(expected_bundle)
  signing_target.build_configurations.each do |config|
    settings = config.build_settings
    raise 'Wrong generated bundle identifier' unless settings['PRODUCT_BUNDLE_IDENTIFIER'] == expected_bundle
    settings['DEVELOPMENT_TEAM'] = metadata.fetch('team')
    settings['CODE_SIGN_STYLE'] = 'Manual'
    settings['CODE_SIGN_IDENTITY'] = metadata.fetch('certificateSha1')
    settings['PROVISIONING_PROFILE_SPECIFIER'] = profile.fetch('uuid')
    settings['PROVISIONING_PROFILE'] = profile.fetch('uuid')
    settings['CURRENT_PROJECT_VERSION'] = '22'
    settings['MARKETING_VERSION'] = '1.0.7'
    settings['ENABLE_BITCODE'] = 'NO'
    next unless is_app
    settings['CUSTOMER_LIVE_ACTIVITY_PUSH_ENVIRONMENT'] = 'production'
    entitlement_path = settings['CODE_SIGN_ENTITLEMENTS']
    raise 'Missing generated app entitlements' unless entitlement_path.is_a?(String) && !entitlement_path.empty?
    entitlement_file = File.expand_path(entitlement_path, File.dirname(project.path.to_s))
    ios_root = File.realpath(File.join(app, 'ios')) + File::SEPARATOR
    raise 'Unexpected entitlement path' unless File.realpath(entitlement_file).start_with?(ios_root)
    entitlements = Xcodeproj::Plist.read_from_path(entitlement_file)
    entitlements['aps-environment'] = 'production'
    entitlements.delete('get-task-allow')
    Xcodeproj::Plist.write_to_path(entitlements, entitlement_file)
  end
end
project.root_object.attributes['DevelopmentTeam'] = metadata.fetch('team')
project.save
scheme_file = File.join(project.path.to_s, 'xcshareddata', 'xcschemes', target.name + '.xcscheme')
raise 'Expected the Expo generated shared app scheme' unless File.file?(scheme_file)
workspaces = Dir.glob(File.join(app, 'ios', '*.xcworkspace'))
raise 'Expected exactly one CocoaPods workspace' unless workspaces.length == 1
File.write(File.join(ENV.fetch('CUSTOMER_CI_TEMP'), 'customer-ios22-signing', 'xcode-target.json'), JSON.generate({'workspace' => workspaces.first, 'scheme' => target.name}))
puts 'Manual signing configured on the Tyre Rescue app and its declared extension targets.'
