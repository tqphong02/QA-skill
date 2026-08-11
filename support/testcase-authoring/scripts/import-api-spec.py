#!/usr/bin/env python3
"""Convert API artifacts into support-testcase-authoring JSON without inventing contracts."""

import argparse
import copy
import datetime
import json
import re
import shlex
import sys
from pathlib import Path
from urllib.parse import parse_qsl, urlsplit


HTTP_METHODS = {'get', 'post', 'put', 'patch', 'delete', 'head', 'options'}
SENSITIVE_KEYS = {
    'authorization', 'cookie', 'password', 'token', 'access_token',
    'refresh_token', 'api_key', 'apikey', 'x-api-key', 'client_secret', 'secret'
}
STATUS_TYPE = {
    400: 'validation', 401: 'negative', 403: 'negative', 404: 'negative',
    409: 'negative', 422: 'validation', 429: 'edge'
}
SUPPORTED_SUFFIXES = {
    '.json', '.yaml', '.yml', '.txt', '.md', '.http', '.rest',
    '.py', '.js', '.jsx', '.ts', '.tsx', '.java', '.cs', '.go'
}
SKIP_DIRS = {'.git', 'node_modules', 'dist', 'build', 'vendor', '.venv', 'venv'}
SKIP_FILES = {'package-lock.json', 'pnpm-lock.yaml', 'yarn.lock'}


def placeholder_for(name, value_type='string'):
    key = re.sub(r'[^a-z0-9]+', '_', str(name).lower()).strip('_') or 'value'
    if key in SENSITIVE_KEYS or any(token in key for token in ('password', 'token', 'secret')):
        return f'<valid_{key}>'
    if value_type in ('integer', 'number'):
        return 1
    if value_type == 'boolean':
        return True
    return f'<valid_{key}>'


def sanitize_secrets(value, parent_key=''):
    if isinstance(value, dict):
        output = {}
        for key, item in value.items():
            lowered = str(key).lower()
            if lowered in SENSITIVE_KEYS or any(token in lowered for token in ('password', 'token', 'secret')):
                output[key] = '' if item == '' else placeholder_for(lowered)
            else:
                output[key] = sanitize_secrets(item, lowered)
        return output
    if isinstance(value, list):
        return [sanitize_secrets(item, parent_key) for item in value]
    return value


def sanitize_headers(headers):
    output = {}
    for key, value in (headers or {}).items():
        lowered = str(key).lower()
        if lowered in SENSITIVE_KEYS or lowered in ('proxy-authorization', 'api-key'):
            output[key] = 'Bearer <valid_token>' if lowered == 'authorization' else '<valid_api_key>'
        else:
            output[key] = value
    return output


def normalize_endpoint(value):
    raw = str(value or '').strip()
    if not raw:
        return ''
    raw = re.sub(r'^\{\{[^}]+\}\}', '', raw)
    raw = re.sub(r'^\$\{[^}]+\}', '', raw)
    if '://' in raw:
        parsed = urlsplit(raw)
        return parsed.path or '/'
    return raw.split('?', 1)[0]


def group_name(value):
    cleaned = re.sub(r'[^A-Za-z0-9]+', '_', str(value or 'API')).strip('_').upper()
    return (cleaned or 'API')[:40]


def resolve_ref(root, value):
    current = value
    seen = set()
    while isinstance(current, dict) and '$ref' in current:
        ref = current['$ref']
        if not str(ref).startswith('#/') or ref in seen:
            return current
        seen.add(ref)
        target = root
        for part in str(ref)[2:].split('/'):
            part = part.replace('~1', '/').replace('~0', '~')
            target = target.get(part, {}) if isinstance(target, dict) else {}
        current = target
    return current if isinstance(current, dict) else {}


def normalize_schema(root, schema):
    schema = resolve_ref(root, schema or {})
    branches = schema.get('allOf') or []
    if branches:
        merged = {'type': schema.get('type', 'object'), 'properties': {}, 'required': []}
        for branch in branches:
            part = normalize_schema(root, branch)
            merged['properties'].update(part.get('properties') or {})
            merged['required'].extend(part.get('required') or [])
            for key in ('example', 'default'):
                if key in part and key not in merged:
                    merged[key] = part[key]
        merged['required'] = list(dict.fromkeys(merged['required']))
        return merged
    for choice_key in ('oneOf', 'anyOf'):
        if schema.get(choice_key):
            return normalize_schema(root, schema[choice_key][0])
    return schema


def sample_from_schema(root, schema, name='value', depth=0):
    schema = normalize_schema(root, schema)
    if depth > 5:
        return placeholder_for(name)
    for key in ('example', 'default', 'const'):
        if key in schema:
            return sanitize_secrets(schema[key], name)
    if schema.get('enum'):
        return sanitize_secrets(schema['enum'][0], name)
    schema_type = schema.get('type')
    if schema_type == 'object' or schema.get('properties'):
        required = set(schema.get('required') or [])
        properties = schema.get('properties') or {}
        keys = required or set(properties)
        return {
            key: sample_from_schema(root, properties.get(key, {}), key, depth + 1)
            for key in properties
            if key in keys
        }
    if schema_type == 'array':
        return [sample_from_schema(root, schema.get('items', {}), name, depth + 1)]
    if schema_type == 'integer':
        return schema.get('minimum', 1)
    if schema_type == 'number':
        return schema.get('minimum', 1.0)
    if schema_type == 'boolean':
        return True
    return placeholder_for(name, schema_type or 'string')


def schema_fields(root, schema):
    schema = normalize_schema(root, schema)
    if schema.get('type') == 'array':
        schema = normalize_schema(root, schema.get('items') or {})
    return list((schema.get('properties') or {}).keys())


def content_schema(content):
    if not isinstance(content, dict):
        return {}, None, None
    for media_type, media in content.items():
        if not isinstance(media, dict):
            continue
        example = media.get('example')
        if example is None and isinstance(media.get('examples'), dict):
            first = next(iter(media['examples'].values()), {})
            if isinstance(first, dict):
                example = first.get('value')
        return media.get('schema') or {}, example, media_type
    return {}, None, None


def response_contract(root, response):
    response = resolve_ref(root, response or {})
    schema, example, media_type = content_schema(response.get('content'))
    if not schema:
        schema = response.get('schema') or {}
    if example is None and 'examples' in response and isinstance(response['examples'], dict):
        example = next(iter(response['examples'].values()), None)
    return {
        'description': str(response.get('description') or '').strip(),
        'schema_fields': schema_fields(root, schema),
        'example': sanitize_secrets(example) if example is not None else None,
        'media_type': media_type,
    }


def security_headers(root, operation, global_security):
    security = operation['security'] if 'security' in operation else global_security
    if not security:
        return {}, False
    schemes = ((root.get('components') or {}).get('securitySchemes') or root.get('securityDefinitions') or {})
    first = security[0] if isinstance(security, list) and security else {}
    scheme_name = next(iter(first), '') if isinstance(first, dict) else ''
    scheme = resolve_ref(root, schemes.get(scheme_name) or {})
    if scheme.get('type') == 'apiKey':
        name = scheme.get('name') or 'X-API-Key'
        return {name: '<valid_api_key>'}, True
    return {'Authorization': 'Bearer <valid_token>'}, True


def extract_openapi(document):
    operations = []
    global_security = document.get('security') or []
    for endpoint, path_item in (document.get('paths') or {}).items():
        path_item = resolve_ref(document, path_item)
        common_parameters = path_item.get('parameters') or []
        for method, operation in path_item.items():
            if method.lower() not in HTTP_METHODS or not isinstance(operation, dict):
                continue
            parameters = common_parameters + (operation.get('parameters') or [])
            query = {}
            path_parameters = []
            required_query = []
            for parameter in parameters:
                parameter = resolve_ref(document, parameter)
                location = parameter.get('in')
                name = parameter.get('name') or 'parameter'
                schema = parameter.get('schema') or parameter
                value = parameter.get('example', sample_from_schema(document, schema, name))
                if location == 'query' and (parameter.get('required') or 'example' in parameter or 'default' in schema):
                    query[name] = sanitize_secrets(value, name)
                    if parameter.get('required'):
                        required_query.append(name)
                if location == 'path':
                    path_parameters.append(name)

            request_schema = {}
            request_example = None
            request_media = None
            request_body = resolve_ref(document, operation.get('requestBody') or {})
            if request_body:
                request_schema, request_example, request_media = content_schema(request_body.get('content'))
            if not request_schema:
                for parameter in parameters:
                    parameter = resolve_ref(document, parameter)
                    if parameter.get('in') == 'body':
                        request_schema = parameter.get('schema') or {}
                        request_example = parameter.get('x-example')
                        break
            body = None
            if request_schema:
                body = request_example if request_example is not None else sample_from_schema(document, request_schema, 'body')
                body = sanitize_secrets(body)

            headers, secured = security_headers(document, operation, global_security)
            if request_media:
                headers['Content-Type'] = request_media
            elif body is not None:
                headers['Content-Type'] = 'application/json'

            responses = {}
            for status, response in (operation.get('responses') or {}).items():
                if str(status).isdigit():
                    responses[int(status)] = response_contract(document, response)

            tags = operation.get('tags') or []
            operations.append({
                'method': method.upper(),
                'endpoint': endpoint,
                'group': group_name(tags[0] if tags else endpoint.strip('/').split('/')[0]),
                'summary': operation.get('summary') or operation.get('operationId') or f'{method.upper()} {endpoint}',
                'description': operation.get('description') or '',
                'headers': sanitize_headers(headers),
                'query': query,
                'body': body,
                'required_body': list(normalize_schema(document, request_schema).get('required') or []),
                'required_query': required_query,
                'path_parameters': path_parameters,
                'secured': secured,
                'responses': responses,
                'source_ref': operation.get('operationId') or f'{method.upper()} {endpoint}',
            })
    source_format = 'openapi' if document.get('openapi') else 'swagger' if document.get('swagger') else 'openapi-like'
    return operations, source_format


def flatten_postman(items, folder='API'):
    for item in items or []:
        if isinstance(item.get('item'), list):
            yield from flatten_postman(item['item'], item.get('name') or folder)
        elif item.get('request'):
            yield folder, item


def postman_url(value):
    if isinstance(value, str):
        raw = value
        query = dict(parse_qsl(urlsplit(raw).query, keep_blank_values=True))
        return normalize_endpoint(raw), query
    if isinstance(value, dict):
        raw = value.get('raw') or '/' + '/'.join(map(str, value.get('path') or []))
        path_parts = value.get('path') or []
        if path_parts:
            normalized_parts = []
            for part in map(str, path_parts):
                if part.startswith(':'):
                    part = '{' + part[1:] + '}'
                elif part.startswith('{{') and part.endswith('}}'):
                    part = '{' + part[2:-2] + '}'
                normalized_parts.append(part)
            endpoint = '/' + '/'.join(normalized_parts)
        else:
            endpoint = normalize_endpoint(raw)
        query = {
            entry.get('key'): entry.get('value')
            for entry in value.get('query') or []
            if not entry.get('disabled') and entry.get('key')
        }
        return endpoint, query
    return '', {}


def extract_postman(document):
    operations = []
    collection_auth = document.get('auth')
    for folder, item in flatten_postman(document.get('item')):
        request = item.get('request') or {}
        method = str(request.get('method') or 'GET').upper()
        endpoint, query = postman_url(request.get('url'))
        headers = {
            header.get('key'): header.get('value')
            for header in request.get('header') or []
            if header.get('key') and not header.get('disabled')
        }
        body = None
        request_body = request.get('body') or {}
        raw_body = request_body.get('raw')
        if raw_body:
            try:
                body = json.loads(raw_body)
            except json.JSONDecodeError:
                body = raw_body
        elif request_body.get('mode') in ('urlencoded', 'formdata'):
            body = {
                entry.get('key'): (
                    f'<file_{entry.get("key")}>' if entry.get('type') == 'file' else entry.get('value', '')
                )
                for entry in request_body.get(request_body['mode']) or []
                if entry.get('key') and not entry.get('disabled')
            }
        responses = {}
        for response in item.get('response') or []:
            code = response.get('code')
            if not isinstance(code, int):
                continue
            example = None
            if response.get('body'):
                try:
                    example = json.loads(response['body'])
                except json.JSONDecodeError:
                    example = response['body']
            fields = list(example.keys()) if isinstance(example, dict) else []
            responses[code] = {
                'description': response.get('name') or response.get('status') or '',
                'schema_fields': fields,
                'example': sanitize_secrets(example) if example is not None else None,
                'media_type': None,
            }
        secured = bool(request.get('auth') or collection_auth or any(str(key).lower() == 'authorization' for key in headers))
        if secured and not any(str(key).lower() == 'authorization' for key in headers):
            headers['Authorization'] = 'Bearer <valid_token>'
        operations.append({
            'method': method,
            'endpoint': endpoint,
            'group': group_name(folder),
            'summary': item.get('name') or f'{method} {endpoint}',
            'description': request.get('description') or '',
            'headers': sanitize_headers(headers),
            'query': sanitize_secrets(query),
            'body': sanitize_secrets(body) if body is not None else None,
            'required_body': [],
            'required_query': [],
            'path_parameters': re.findall(r'[{:](\w+)[}]?', endpoint),
            'secured': secured,
            'responses': responses,
            'source_ref': item.get('name') or f'{method} {endpoint}',
        })
    return operations, 'postman'


def extract_generic(document):
    entries = document if isinstance(document, list) else (
        document.get('endpoints') or document.get('routes') or
        document.get('apis') or document.get('requests') or []
    )
    operations = []
    for index, entry in enumerate(entries, 1):
        if not isinstance(entry, dict):
            continue
        method = str(entry.get('method') or '').upper()
        endpoint = normalize_endpoint(entry.get('endpoint') or entry.get('path') or entry.get('url'))
        status = entry.get('expected_status', entry.get('status'))
        if isinstance(status, str) and status.isdigit():
            status = int(status)
        responses = {}
        if isinstance(status, int):
            schema = entry.get('expected_schema') or entry.get('response_schema') or []
            fields = schema if isinstance(schema, list) else list((schema.get('properties') or {}).keys()) if isinstance(schema, dict) else []
            responses[status] = {
                'description': entry.get('expected_description') or '',
                'schema_fields': fields,
                'example': sanitize_secrets(entry.get('expected_body')) if 'expected_body' in entry else None,
                'media_type': None,
            }
        operations.append({
            'method': method,
            'endpoint': endpoint,
            'group': group_name(entry.get('group') or entry.get('tag') or endpoint.strip('/').split('/')[0]),
            'summary': entry.get('summary') or entry.get('name') or f'{method} {endpoint}',
            'description': entry.get('description') or '',
            'headers': sanitize_headers(entry.get('headers') or {}),
            'query': sanitize_secrets(entry.get('query') or entry.get('params') or {}),
            'body': sanitize_secrets(entry.get('body') if 'body' in entry else entry.get('request_body')),
            'required_body': entry.get('required_body') or [],
            'required_query': entry.get('required_query') or [],
            'path_parameters': re.findall(r'{(\w+)}', endpoint),
            'secured': bool(entry.get('security') or entry.get('auth')),
            'responses': responses,
            'source_ref': entry.get('id') or f'endpoint-{index}',
        })
    return operations, 'generic-json'


def curl_operation(command, index):
    try:
        tokens = shlex.split(command.replace('\\\n', ' '))
    except ValueError:
        return None
    method = 'GET'
    url = ''
    headers = {}
    body = None
    i = 1
    while i < len(tokens):
        token = tokens[i]
        if token in ('-X', '--request') and i + 1 < len(tokens):
            method = tokens[i + 1].upper()
            i += 2
            continue
        if token in ('-H', '--header') and i + 1 < len(tokens):
            key, _, value = tokens[i + 1].partition(':')
            if key:
                headers[key.strip()] = value.strip()
            i += 2
            continue
        if token in ('-d', '--data', '--data-raw', '--data-binary') and i + 1 < len(tokens):
            raw = tokens[i + 1]
            try:
                body = json.loads(raw)
            except json.JSONDecodeError:
                body = raw
            if method == 'GET':
                method = 'POST'
            i += 2
            continue
        if token.startswith('http://') or token.startswith('https://') or token.startswith('/'):
            url = token
        i += 1
    endpoint = normalize_endpoint(url)
    if not endpoint:
        return None
    return {
        'method': method,
        'endpoint': endpoint,
        'group': group_name(endpoint.strip('/').split('/')[0]),
        'summary': f'{method} {endpoint}',
        'description': '',
        'headers': sanitize_headers(headers),
        'query': dict(parse_qsl(urlsplit(url).query, keep_blank_values=True)),
        'body': sanitize_secrets(body) if body is not None else None,
        'required_body': [], 'required_query': [],
        'path_parameters': re.findall(r'{(\w+)}', endpoint),
        'secured': any(str(key).lower() == 'authorization' for key in headers),
        'responses': {}, 'source_ref': f'curl-{index}',
    }


def extract_text(text):
    operations = []
    lines = text.splitlines()
    command = ''
    curl_index = 0
    for line in lines:
        stripped = line.strip()
        if stripped.startswith('curl '):
            if command:
                curl_index += 1
                operation = curl_operation(command, curl_index)
                if operation:
                    operations.append(operation)
            command = stripped
        elif command and command.endswith('\\'):
            command += '\n' + stripped
        elif command:
            curl_index += 1
            operation = curl_operation(command, curl_index)
            if operation:
                operations.append(operation)
            command = ''
    if command:
        curl_index += 1
        operation = curl_operation(command, curl_index)
        if operation:
            operations.append(operation)

    patterns = [
        re.compile(r'^\s*(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s+([^\s]+)(?:\s*(?:->|=>)\s*(\d{3}))?', re.I),
        re.compile(r'@(?:app|router)\.(get|post|put|patch|delete|head|options)\(\s*["\']([^"\']+)["\'][^)]*?(?:status_code\s*=\s*(\d{3}))?', re.I),
        re.compile(r'(?:app|router)\.(get|post|put|patch|delete|head|options)\(\s*["\']([^"\']+)["\']', re.I),
    ]
    seen = {(op['method'], op['endpoint']) for op in operations}
    for line_number, line in enumerate(lines, 1):
        if line.lstrip().startswith('curl '):
            continue
        for pattern in patterns:
            match = pattern.search(line)
            if not match:
                continue
            method, endpoint = match.group(1).upper(), normalize_endpoint(match.group(2))
            status_match = re.search(r'(?:status_code\s*=|(?:->|=>))\s*(\d{3})', line, re.I)
            status = status_match.group(1) if status_match else None
            if (method, endpoint) in seen:
                break
            responses = {}
            if status:
                responses[int(status)] = {'description': '', 'schema_fields': [], 'example': None, 'media_type': None}
            operations.append({
                'method': method, 'endpoint': endpoint,
                'group': group_name(endpoint.strip('/').split('/')[0]),
                'summary': f'{method} {endpoint}', 'description': '',
                'headers': {}, 'query': {}, 'body': None,
                'required_body': [], 'required_query': [],
                'path_parameters': re.findall(r'{(\w+)}', endpoint),
                'secured': False, 'responses': responses,
                'source_ref': f'line-{line_number}',
            })
            seen.add((method, endpoint))
            break
    return operations, 'text-endpoints'


def load_artifact(path):
    text = path.read_text(encoding='utf-8')
    document = None
    if path.suffix.lower() in ('.yaml', '.yml'):
        try:
            import yaml
        except ImportError as exc:
            raise RuntimeError('PyYAML is required for YAML input: pip install PyYAML') from exc
        document = yaml.safe_load(text)
    else:
        try:
            document = json.loads(text)
        except json.JSONDecodeError:
            document = None
    looks_like_openapi = isinstance(document, dict) and isinstance(document.get('paths'), dict) and any(
        isinstance(path_item, dict) and any(str(key).lower() in HTTP_METHODS for key in path_item)
        for path_item in document.get('paths', {}).values()
    )
    if looks_like_openapi:
        return extract_openapi(document)
    if isinstance(document, dict) and isinstance(document.get('item'), list):
        return extract_postman(document)
    if isinstance(document, list) or isinstance(document, dict) and any(
        key in document for key in ('endpoints', 'routes', 'apis', 'requests')
    ):
        return extract_generic(document)
    return extract_text(text)


def load_artifacts(path):
    if path.is_file():
        return load_artifact(path)
    candidates = sorted(
        candidate for candidate in path.rglob('*')
        if candidate.is_file()
        and candidate.suffix.lower() in SUPPORTED_SUFFIXES
        and candidate.name not in SKIP_FILES
        and not any(part in SKIP_DIRS for part in candidate.relative_to(path).parts)
        and candidate.stat().st_size <= 10 * 1024 * 1024
    )
    merged = {}
    formats = set()
    for candidate in candidates:
        try:
            operations, source_format = load_artifact(candidate)
        except (OSError, UnicodeDecodeError, RuntimeError, ValueError):
            continue
        if not operations:
            continue
        formats.add(source_format)
        relative = candidate.relative_to(path)
        for operation in operations:
            operation['source_ref'] = f'{relative}#{operation["source_ref"]}'
            key = (operation['method'], operation['endpoint'])
            score = len(operation.get('responses') or {}) + int(operation.get('body') is not None)
            previous = merged.get(key)
            previous_score = -1 if previous is None else len(previous.get('responses') or {}) + int(previous.get('body') is not None)
            if score > previous_score:
                merged[key] = operation
    label = 'multi-file:' + ','.join(sorted(formats)) if formats else 'multi-file'
    return list(merged.values()), label


def select_success(responses, default_status):
    statuses = sorted(status for status in responses if 200 <= status <= 299)
    return statuses[0] if statuses else default_status


def api_payload(operation, status, contract, headers=None, query=None, body_marker=False, body=None):
    payload = {
        'method': operation['method'],
        'endpoint': operation['endpoint'],
        'headers': sanitize_headers(headers if headers is not None else operation['headers']),
        'query': sanitize_secrets(query if query is not None else operation['query']),
        'expected_status': status,
    }
    source_body = operation['body'] if not body_marker else body
    if source_body is not None:
        payload['body'] = sanitize_secrets(source_body)
    if contract.get('media_type'):
        payload['expected_headers'] = {'Content-Type': contract['media_type']}
    if contract.get('schema_fields'):
        payload['expected_schema'] = contract['schema_fields']
    if contract.get('example') is not None:
        payload['expected_body'] = sanitize_secrets(contract['example'])
    if contract.get('description'):
        payload['additional_expected'] = [f'Response khớp mô tả spec: {contract["description"]}']
    return payload


def build_generator_input(operations, args, source_format, source_name):
    groups = {}
    requirements = []
    review_required = []
    scenario_counter = 0

    def add_case(operation, status, case_type, behavior, description, api, precondition):
        nonlocal scenario_counter
        scenario_counter += 1
        req_id = f'API-{scenario_counter:03d}'
        requirements.append({'id': req_id, 'text': f'{operation["source_ref"]} -> HTTP {status}'})
        slug = group_name(operation['group'])[:8]
        scenario = {
            'scenario_id': f'SCN-API-{slug}-{scenario_counter:03d}',
            'requirement': req_id,
            'scenario_name': behavior,
            'cases': [{
                'type': case_type,
                'req': req_id,
                'description': description,
                'pre_condition': precondition,
                'priority': 'High' if case_type in ('happy', 'validation', 'negative') else 'Medium',
                'api': api,
            }],
        }
        groups.setdefault(operation['group'], []).append(scenario)

    for operation in operations:
        if operation['method'].lower() not in HTTP_METHODS or not operation['endpoint']:
            review_required.append({'source': operation.get('source_ref'), 'missing': 'method hoặc endpoint'})
            continue
        success_status = select_success(operation['responses'], args.default_success_status)
        if success_status is None:
            review_required.append({'source': operation['source_ref'], 'missing': 'documented 2xx expected status'})
            continue
        success_contract = operation['responses'].get(success_status, {'description': '', 'schema_fields': [], 'example': None, 'media_type': None})
        precondition = 'API service khả dụng'
        if operation['secured']:
            precondition += '\nCó credential QA hợp lệ với đúng quyền'
        behavior = f'API {operation["summary"]}'
        add_case(
            operation, success_status, 'happy', behavior,
            f'Xác minh rằng API {operation["method"]} {operation["endpoint"]} trả response thành công theo tài liệu',
            api_payload(operation, success_status, success_contract), precondition,
        )

        for auth_status, token in ((401, '<invalid_token>'), (403, '<token_without_required_permission>')):
            if operation['secured'] and auth_status in operation['responses']:
                headers = copy.deepcopy(operation['headers'])
                auth_key = next((key for key in headers if str(key).lower() == 'authorization'), 'Authorization')
                headers[auth_key] = f'Bearer {token}'
                contract = operation['responses'][auth_status]
                add_case(
                    operation, auth_status, 'negative', f'API authorization HTTP {auth_status}',
                    f'Xác minh rằng API từ chối request với authorization không hợp lệ và trả HTTP {auth_status}',
                    api_payload(operation, auth_status, contract, headers=headers),
                    'API service khả dụng',
                )

        validation_status = next((status for status in (400, 422) if status in operation['responses']), None)
        if validation_status:
            contract = operation['responses'][validation_status]
            for field in operation['required_body']:
                if not isinstance(operation['body'], dict) or field not in operation['body']:
                    continue
                body = copy.deepcopy(operation['body'])
                body.pop(field, None)
                add_case(
                    operation, validation_status, 'validation', f'API validation field {field}',
                    f'Xác minh rằng API từ chối request thiếu field bắt buộc {field}',
                    api_payload(operation, validation_status, contract, body_marker=True, body=body),
                    precondition,
                )
            for field in operation['required_query']:
                query = copy.deepcopy(operation['query'])
                query.pop(field, None)
                add_case(
                    operation, validation_status, 'validation', f'API validation query {field}',
                    f'Xác minh rằng API từ chối request thiếu query parameter bắt buộc {field}',
                    api_payload(operation, validation_status, contract, query=query),
                    precondition,
                )

        if 404 in operation['responses'] and operation['path_parameters']:
            parameter = operation['path_parameters'][0]
            contract = operation['responses'][404]
            api = api_payload(operation, 404, contract)
            api['additional_steps'] = [f'Gán path parameter {parameter} = <nonexistent_{parameter}>']
            add_case(
                operation, 404, 'negative', f'API resource {parameter} không tồn tại',
                f'Xác minh rằng API trả HTTP 404 khi {parameter} không tồn tại',
                api, precondition,
            )

    sections = [
        {'title': '1.1. USER INTERFACE', 'kind': 'ui', 'groups': []},
        {
            'title': '1.2. FUNCTION', 'kind': 'api',
            'groups': [
                {'name': name, 'scenarios': scenarios}
                for name, scenarios in groups.items()
            ],
        },
    ]
    return {
        'project': {
            'name': args.project_name,
            'code': args.project_code,
            'device': 'API',
            'version': args.version,
            'priority': 'High',
            'test_date': datetime.date.today().isoformat(),
            'author': args.author,
            'reviewer': args.reviewer,
            'description': f'API testcase imported from {source_name}',
            'objective': 'Xác minh API contract theo tài liệu nguồn',
        },
        'source_document': source_name,
        'source_format': source_format,
        'requirements': requirements,
        'review_required': review_required,
        'sections': sections,
    }


def parse_args():
    parser = argparse.ArgumentParser(description='Import API artifacts into support-testcase-authoring JSON')
    parser.add_argument('source', type=Path)
    parser.add_argument('output', type=Path)
    parser.add_argument('--project-code', required=True)
    parser.add_argument('--project-name', required=True)
    parser.add_argument('--version', default='v1')
    parser.add_argument('--author', default='QA Team')
    parser.add_argument('--reviewer', default='Lead QA')
    parser.add_argument('--default-success-status', type=int, choices=range(200, 300))
    parser.add_argument('--allow-review', action='store_true', help='Return success even when unresolved operations remain')
    return parser.parse_args()


def main():
    args = parse_args()
    if not args.source.exists():
        print(f'Input path not found: {args.source}', file=sys.stderr)
        return 1
    operations, source_format = load_artifacts(args.source)
    if not operations:
        print('No API endpoint found in input file', file=sys.stderr)
        return 1
    output = build_generator_input(operations, args, source_format, args.source.name)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(output, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    case_count = sum(
        len(scenario['cases'])
        for group in output['sections'][1]['groups']
        for scenario in group['scenarios']
    )
    print(f'Imported format: {source_format}')
    print(f'Operations found: {len(operations)}')
    print(f'API testcases generated: {case_count}')
    print(f'Review required: {len(output["review_required"])}')
    print(f'Output: {args.output}')
    if output['review_required'] and not args.allow_review:
        print('Stop before Excel generation and resolve review_required or pass --default-success-status', file=sys.stderr)
        return 2
    return 0


if __name__ == '__main__':
    sys.exit(main())
