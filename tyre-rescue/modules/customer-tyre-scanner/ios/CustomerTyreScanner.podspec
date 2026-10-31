Pod::Spec.new do |s|
  s.name = 'CustomerTyreScanner'
  s.version = '1.0.0'
  s.summary = 'On-device tyre photo text recognition'
  s.description = 'Reads tyre sidewall text locally for customer-confirmed size suggestions.'
  s.author = 'Tyre Rescue'
  s.homepage = 'https://www.tyrerescue.uk'
  s.license = { :type => 'Proprietary' }
  s.source = { :git => 'https://github.com/ahmadalwakai/tyrerescue.git' }
  s.platform = :ios, '15.1'
  s.swift_version = '5.9'
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.frameworks = 'Vision', 'ImageIO'
  s.source_files = '**/*.swift'
  s.pod_target_xcconfig = { 'DEFINES_MODULE' => 'YES' }
end
