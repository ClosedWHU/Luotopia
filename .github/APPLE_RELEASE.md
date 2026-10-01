# Apple TestFlight operations

Source, signing, build orchestration, and validations are maintained in the
private `ClosedWHU/Luotopia-app` repository. These public workflows never
publish source, Dart symbols, native dSYMs, or raw compiler output as artifacts.

## First installation

1. Configure the `testflight` environment and App Store Connect API secrets.
2. Import the existing distribution identity and all Store profiles with Match
   into `ClosedWHU/Luotopia-Certificates`. Store only encrypted signing files.
3. Run **Initialize Apple signing**, passing the full private app commit with
   the Fastlane configuration. This creates the installer identity if missing
   and then proves both platforms can install signing material readonly.
4. Run **Apple TestFlight** once per platform with `upload_testflight=false`.
5. After successful validation, upload using an unused build number.

The repository disables SSH deploy keys, so this installation uses the
existing cross-repository HTTPS token. It needs access to both private repos:
app contents read/write for private symbol releases, certificates read for
routine builds, and certificates write only for one-time initialization.

## Release and retry

`1.0.1+14` is reserved for Apple-only TestFlight CI validation. Use the
standalone **Apple TestFlight** workflow with uploads enabled for iOS and
macOS. Do not create a public `v1.0.1+14` release or trigger the multi-platform
release workflow. No Android, Windows, Linux, or HarmonyOS artifacts or public
website release notes are published for this build.

Publishing `v1.0.1+14`, for example, resolves an immutable private app commit
whose pubspec matches `1.0.1+14`, builds both Apple platforms, preserves their
private symbols, then uploads them to TestFlight. iOS and macOS have distinct
jobs, so failure of one does not prevent the other platform's build.

Manual **App release build** runs expose `build_ios_testflight` and
`build_macos_testflight`, independently of the existing opt-in unsigned DMG.
`upload_apple_testflight=false` validates without uploading. Other platforms
can be turned off for an Apple-only retry. The standalone Apple workflow can
also build a specified full app SHA before a public release is published.

Do not retry an accepted App Store Connect build number. Check processing and
upload status first. Compiler logs and symbols are in the private app repo's
`symbols-<version>-<number>` release, with unique run/attempt asset names.

iOS uses `xcode-27` with `APPLE_IOS_XCODE_VERSION=27.1` because the native tab
bar requires that SDK. macOS uses `macos-26` (arm64) and
`APPLE_XCODE_VERSION=26.6`. Both use `APPLE_FLUTTER_VERSION=3.47.5`.
The iOS runner is currently a public preview; App Store Connect determines
whether builds made with that Xcode version may be uploaded.
