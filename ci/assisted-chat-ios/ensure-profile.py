#!/usr/bin/env python3
"""Create (or reuse) the App Store profile Codemagic signs Assisted Chat with.

The profile pairs uk.tyrerescue.assistedchat with the Apple Distribution
certificate already stored in Codemagic (the one the Vibeset App Store profile
uses), so no certificate or private key has to be exported from EAS. Existing
profiles, including the one EAS builds use, are left untouched.

Authenticates with the App Store Connect API key from the workflow's
`integrations: app_store_connect` entry. Prints no secrets.
"""
import json
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

import jwt

API = 'https://api.appstoreconnect.apple.com/v1'
BUNDLE = 'uk.tyrerescue.assistedchat'
# The App Store profile whose certificate Codemagic holds the private key for.
REFERENCE_BUNDLE = 'com.ahmadalwakai.vibeset'
PROFILE_NAME = 'Tyre Rescue Assisted Chat Codemagic App Store'
DISTRIBUTION_TYPES = {'DISTRIBUTION', 'IOS_DISTRIBUTION'}


def private_key(raw: str) -> str:
    """Accept the forms Codemagic uses: PEM text, @file:/@env: references,
    escaped newlines, or the bare base64 body."""
    value = raw.strip()
    for _ in range(3):
        if value.startswith('@file:'):
            with open(os.path.expanduser(value[len('@file:'):]), encoding='utf-8') as handle:
                value = handle.read().strip()
        elif value.startswith('@env:'):
            value = os.environ.get(value[len('@env:'):], '').strip()
        else:
            break
    value = value.replace('\\n', '\n').strip().strip('"').strip("'")
    # Rebuild the PEM framing from its body: the value may arrive on one line.
    framed = re.search(r'-----BEGIN ([A-Z ]+)-----(.*?)-----END \1-----', value, re.S)
    label, body = (framed.group(1), framed.group(2)) if framed else ('PRIVATE KEY', value)
    body = ''.join(body.split())
    lines = [body[i:i + 64] for i in range(0, len(body), 64)]
    stripped = raw.strip()
    form = stripped.split(':', 1)[0] if stripped.startswith('@') else 'pem' if framed else 'base64'
    print(f'App Store Connect key loaded (source form: {form}).')
    return f'-----BEGIN {label}-----\n' + '\n'.join(lines) + f'\n-----END {label}-----\n'


def token() -> str:
    names = ['APP_STORE_CONNECT_ISSUER_ID', 'APP_STORE_CONNECT_KEY_IDENTIFIER', 'APP_STORE_CONNECT_PRIVATE_KEY']
    missing = [name for name in names if not os.environ.get(name)]
    if missing:
        sys.exit('App Store Connect integration variables are missing: ' + ', '.join(missing))
    now = int(time.time())
    return jwt.encode(
        {'iss': os.environ['APP_STORE_CONNECT_ISSUER_ID'], 'iat': now, 'exp': now + 900, 'aud': 'appstoreconnect-v1'},
        private_key(os.environ['APP_STORE_CONNECT_PRIVATE_KEY']),
        algorithm='ES256',
        headers={'kid': os.environ['APP_STORE_CONNECT_KEY_IDENTIFIER'], 'typ': 'JWT'},
    )


AUTH = token()


def request(method: str, path: str, query: dict | None = None, body: dict | None = None) -> dict:
    url = API + path + ('?' + urllib.parse.urlencode(query) if query else '')
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method, headers={
        'Authorization': 'Bearer ' + AUTH, 'Content-Type': 'application/json',
    })
    try:
        with urllib.request.urlopen(req, timeout=60) as response:
            return json.loads(response.read() or b'{}')
    except urllib.error.HTTPError as error:
        detail = error.read().decode(errors='replace')[:2000]
        sys.exit(f'{method} {path} failed ({error.code}): {detail}')


def app_store_profiles() -> tuple[list[dict], dict]:
    result = request('GET', '/profiles', {
        'filter[profileType]': 'IOS_APP_STORE',
        'filter[profileState]': 'ACTIVE',
        'include': 'bundleId,certificates',
        'limit': '200',
        'limit[certificates]': '50',
    })
    included = {(item['type'], item['id']): item for item in result.get('included', [])}
    return result.get('data', []), included


def profile_bundle(profile: dict, included: dict) -> str | None:
    ref = profile['relationships']['bundleId']['data']
    item = included.get((ref['type'], ref['id'])) if ref else None
    return item['attributes']['identifier'] if item else None


def profile_certificate_ids(profile: dict) -> set[str]:
    return {ref['id'] for ref in profile['relationships']['certificates'].get('data') or []}


def main() -> None:
    bundles = request('GET', '/bundleIds', {'filter[identifier]': BUNDLE, 'filter[platform]': 'IOS'}).get('data', [])
    bundle = next((item for item in bundles if item['attributes']['identifier'] == BUNDLE), None)
    if not bundle:
        sys.exit(f'Bundle ID {BUNDLE} is not registered on the Apple Developer Portal.')

    profiles, included = app_store_profiles()
    reference = [p for p in profiles if profile_bundle(p, included) == REFERENCE_BUNDLE]
    candidates = set().union(*(profile_certificate_ids(p) for p in reference)) if reference else set()
    certificates = [
        included[('certificates', cid)] for cid in candidates
        if ('certificates', cid) in included
        and included[('certificates', cid)]['attributes'].get('certificateType') in DISTRIBUTION_TYPES
    ]
    for cert in certificates:
        a = cert['attributes']
        print(f"Reference certificate: {a.get('name')} serial={a.get('serialNumber')} expires={a.get('expirationDate')}")
    if len(certificates) != 1:
        sys.exit(f'Expected exactly one distribution certificate on the {REFERENCE_BUNDLE} App Store profile, found {len(certificates)}.')
    certificate = certificates[0]

    for profile in profiles:
        if profile_bundle(profile, included) == BUNDLE and certificate['id'] in profile_certificate_ids(profile):
            a = profile['attributes']
            print(f"Reusing profile '{a['name']}' uuid={a['uuid']} expires={a['expirationDate']}")
            return

    created = request('POST', '/profiles', body={'data': {
        'type': 'profiles',
        'attributes': {'name': PROFILE_NAME, 'profileType': 'IOS_APP_STORE'},
        'relationships': {
            'bundleId': {'data': {'type': 'bundleIds', 'id': bundle['id']}},
            'certificates': {'data': [{'type': 'certificates', 'id': certificate['id']}]},
        },
    }})['data']['attributes']
    print(f"Created profile '{created['name']}' uuid={created['uuid']} expires={created['expirationDate']}")


main()
