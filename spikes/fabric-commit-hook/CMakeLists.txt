# Windforge Fabric commit-hook spike — build skeleton.
#
# This is NOT part of the main pnpm/turbo build. It exists so the spike can
# be compiled standalone once pointed at a React Native checkout. In a real
# app it would be compiled by the app's native build (CocoaPods/Buck or
# Gradle/CMake), with the react-native include paths supplied by the RN pod
# or prefab.
cmake_minimum_required(VERSION 3.22)
project(windforge_fabric_spike CXX)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# Point this at react-native/ReactCommon before configuring.
set(REACT_NATIVE_ROOT "" CACHE PATH "Path to react-native/ReactCommon root")
if(REACT_NATIVE_ROOT STREQUAL "")
  message(FATAL_ERROR "Set -DREACT_NATIVE_ROOT=<path>/node_modules/react-native")
endif()

add_library(windforge_fabric_spike STATIC
  src/StyleRegistry.cpp
  src/StyleCommitHook.cpp
  src/WindforgeStyleModule.cpp
)

target_include_directories(windforge_fabric_spike PUBLIC
  include
  ${REACT_NATIVE_ROOT}/ReactCommon
  ${REACT_NATIVE_ROOT}/ReactCommon/jsi
)

# folly / glog / gflags are provided by the RN build environment in a real
# app; the spike compiles the same translation units standalone.
target_compile_options(windforge_fabric_spike PRIVATE -Wall -Wextra)
