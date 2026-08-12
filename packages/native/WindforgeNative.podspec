require "json"

package = JSON.parse(File.read(File.join(__dir__, "package.json")))

Pod::Spec.new do |s|
  s.name         = "WindforgeNative"
  s.version      = package["version"]
  s.summary      = package["description"]
  s.homepage     = "https://github.com/ui-wind/windforge"
  s.license      = package["license"]
  s.author       = "ui-wind"
  s.platforms    = { :ios => "15.1" }
  s.source       = { :git => "https://github.com/ui-wind/windforge.git", :tag => "#{s.version}" }

  s.source_files = "ios/**/*.{h,m,mm}", "cpp/**/*.{h,cpp}"
  s.public_header_files = "cpp/include/**/*.h"
  s.header_mappings_dir = "cpp/include"

  s.pod_target_xcconfig = {
    "CLANG_CXX_LANGUAGE_STANDARD" => "c++20",
    # cpp/include for our own umbrella headers. React-Fabric's public
    # headers pull in Yoga internals (yoga/style/Style.h), which the
    # Yoga pod only exposes privately — React-Fabric/core uses the same
    # literal path for the same reason.
    "HEADER_SEARCH_PATHS" => "\"$(PODS_TARGET_SRCROOT)/cpp/include\" \"$(PODS_ROOT)/Headers/Private/Yoga\"",
  }

  # The C++ core talks to public React headers. React-Core supplies the
  # ObjC++ bridge surface; the Fabric renderer headers (UIManager,
  # ShadowNodeFamily, commit hook) ship in React-Fabric, and the iOS
  # presenter/scheduler layer in React-RCTFabric. React-utils provides
  # FollyConvert. ReactCommon/turbomodule provides RCTTurboModule.
  s.dependency "React-Core"
  s.dependency "React-Fabric"
  s.dependency "React-RCTFabric"
  s.dependency "React-utils"
  s.dependency "ReactCommon/turbomodule/core"

  # New Architecture only (architecture §4): no RCT_NEW_ARCH_ENABLED gate.
end
