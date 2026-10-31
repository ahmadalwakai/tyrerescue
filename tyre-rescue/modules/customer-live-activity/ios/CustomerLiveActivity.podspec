Pod::Spec.new do |s|
  s.name = 'CustomerLiveActivity'
  s.version = '1.0.0'
  s.summary = 'Tyre Rescue customer journey Live Activities'
  s.description = 'Local ActivityKit bridge for the Tyre Rescue customer application.'
  s.author = 'Tyre Rescue'
  s.homepage = 'https://www.tyrerescue.uk'
  s.license = { :type => 'Proprietary' }
  # Autolinking installs this as a development pod from the local module path.
  s.source = { :git => 'https://github.com/ahmadalwakai/tyrerescue.git' }
  s.platform = :ios, '15.1'
  s.swift_version = '5.9'
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.weak_frameworks = 'ActivityKit'
  s.source_files = '**/*.swift'
  s.pod_target_xcconfig = { 'DEFINES_MODULE' => 'YES' }
end
