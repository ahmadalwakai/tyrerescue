#!/usr/bin/env python3
import os
from pathlib import Path
import re
import sys
stage, filename = sys.argv[1:]
text = Path(filename).read_text(errors='replace')
for name, value in os.environ.items():
    if value and len(value) > 8 and (name.startswith('ASSISTED_IOS_') or 'TOKEN' in name or 'PASSWORD' in name or 'SECRET' in name):
        text = text.replace(value, '[redacted]')
text = re.sub(r'-----BEGIN [^-]+-----.*?-----END [^-]+-----', '[redacted-key]', text, flags=re.S)
text = re.sub(r'\b(?:whsec_|(?:sk|rk)_(?:live|test)_|(?:sk|pk)\.)[A-Za-z0-9_.-]+', '[redacted-token]', text)
text = re.sub(r'(?i)(?:password|token|secret|authorization|base64)\s*[:=]\s*\S+', '[redacted-field]', text)
diagnostics = [line[:800] for line in text.splitlines() if re.search(r'(?i)(?:\berror:|fatal error|\*\* .*FAILED|error code|unable to|requires a provisioning profile|no profiles for)', line)]
print('Failed stage: ' + stage)
for line in diagnostics[-30:]:
    print(line)
if not diagnostics:
    print('No safe compiler error lines were available. Private logs are removed automatically.')
