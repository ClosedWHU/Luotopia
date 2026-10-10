#!/usr/bin/env python3
"""Exercise the real release-context shell without contacting GitHub."""

import json
import os
from pathlib import Path
import re
import subprocess
import tempfile
import textwrap
import unittest

WORKFLOW = Path(__file__).resolve().parents[1] / "workflows/app-release.yml"


def resolve_script():
    lines = WORKFLOW.read_text().splitlines()
    start = lines.index("      - name: Resolve")
    start = lines.index("        run: |", start) + 1
    code = []
    for line in lines[start:]:
        if line and not line.startswith("          "):
            break
        code.append(line)
    return textwrap.dedent("\n".join(code))


class ReleaseContextTest(unittest.TestCase):
    def resolve(self, event="workflow_dispatch", **overrides):
        values = {
            "github.event_name": event, "github.repository": "ClosedWHU/Luotopia",
            "github.event.release.tag_name": "v1.0.1+15",
            "github.event.release.prerelease": "true",
            "inputs.tag": "v1.0.1+15", "inputs.prerelease": "true",
            "inputs.apple_only": "false", "inputs.build_android": "true",
            "inputs.apple_action": "build", "inputs.distribute_apple_external": "true",
            "inputs.build_windows": "true", "inputs.build_macos": "false",
            "inputs.windows_arch": "both",
            "inputs.build_ios_testflight": "false", "inputs.build_macos_testflight": "false",
            "inputs.upload_apple_testflight": "true", "inputs.build_linux": "true",
            "inputs.build_ohos": "false", "inputs.linux_arch": "both",
            "inputs.linux_formats": "all",
        }
        values.update(overrides)
        code = re.sub(r"\$\{\{\s*([^}]+?)\s*\}\}", lambda match: values[match[1]], resolve_script())
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / "outputs"
            result = subprocess.run(["bash", "-c", code], env=dict(os.environ, GITHUB_OUTPUT=str(output)),
                                    capture_output=True, text=True, timeout=10)
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
            return dict(line.split("=", 1) for line in output.read_text().splitlines())

    def assert_no_public_platforms(self, outputs):
        for name in ("build_android", "build_windows", "build_linux", "build_ohos", "build_macos"):
            self.assertEqual(outputs[name], "false", name)

    def test_plus14_is_apple_only_even_with_other_platform_defaults_enabled(self):
        outputs = self.resolve(**{"inputs.tag": "v1.0.1+14"})
        self.assert_no_public_platforms(outputs)
        self.assertEqual(json.loads(outputs["apple_platforms"]), ["ios", "macos"])
        self.assertEqual((outputs["build_name"], outputs["build_number"]), ("1.0.1", "14"))

    def test_apple_only_retry_selects_just_one_platform(self):
        outputs = self.resolve(**{"inputs.apple_only": "true", "inputs.build_ios_testflight": "true"})
        self.assert_no_public_platforms(outputs)
        self.assertEqual(json.loads(outputs["apple_platforms"]), ["ios"])

    def test_macos_only_plus14_retry_keeps_ios_off(self):
        outputs = self.resolve(**{"inputs.tag": "v1.0.1+14", "inputs.build_macos_testflight": "true"})
        self.assert_no_public_platforms(outputs)
        self.assertEqual(json.loads(outputs["apple_platforms"]), ["macos"])

    def test_regular_manual_release_preserves_other_platform_switches(self):
        outputs = self.resolve()
        self.assertEqual(outputs["build_android"], "true")
        self.assertEqual(outputs["build_windows"], "true")
        self.assertEqual(outputs["build_linux"], "true")
        self.assertEqual(json.loads(outputs["apple_platforms"]), [])

    def test_windows_arch_selection_maps_to_the_job_matrix(self):
        outputs = self.resolve()
        self.assertEqual(json.loads(outputs["windows_archs"]), ["x64", "arm64"])
        outputs = self.resolve(**{"inputs.windows_arch": "arm64"})
        self.assertEqual(json.loads(outputs["windows_archs"]), ["arm64"])
        outputs = self.resolve(**{"inputs.windows_arch": "x64"})
        self.assertEqual(json.loads(outputs["windows_archs"]), ["x64"])
        outputs = self.resolve(event="release")
        self.assertEqual(json.loads(outputs["windows_archs"]), ["x64", "arm64"])

    def test_published_regular_release_includes_both_apple_platforms(self):
        outputs = self.resolve(event="release")
        self.assertEqual(json.loads(outputs["apple_platforms"]), ["ios", "macos"])
        self.assertEqual(outputs["build_android"], "true")

    def test_build_only_mode_does_not_enable_upload(self):
        outputs = self.resolve(**{"inputs.apple_only": "true", "inputs.upload_apple_testflight": "false"})
        self.assertEqual(outputs["upload_apple_testflight"], "false")

    def test_external_distribution_mode_disables_all_public_platforms(self):
        outputs = self.resolve(**{"inputs.apple_action": "distribute", "inputs.build_macos_testflight": "true"})
        self.assert_no_public_platforms(outputs)
        self.assertEqual(outputs["apple_action"], "distribute")
        self.assertEqual(json.loads(outputs["apple_platforms"]), ["macos"])
        self.assertEqual(outputs["distribute_apple_external"], "true")


    def test_status_mode_is_apple_only(self):
        outputs = self.resolve(**{"inputs.apple_action": "status", "inputs.build_ios_testflight": "true"})
        self.assert_no_public_platforms(outputs)
        self.assertEqual(outputs["apple_action"], "status")
        self.assertEqual(json.loads(outputs["apple_platforms"]), ["ios"])


if __name__ == "__main__":
    unittest.main(verbosity=2)
