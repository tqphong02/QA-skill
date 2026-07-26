#!/usr/bin/env python3
"""Generate an importable Apache JMeter HTTP Test Plan from normalized JSON."""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
import xml.etree.ElementTree as ET
from pathlib import Path
from typing import Any
from urllib.parse import urlparse


METHODS = {"GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"}


def string_prop(parent: ET.Element, name: str, value: Any = "") -> ET.Element:
    node = ET.SubElement(parent, "stringProp", {"name": name})
    node.text = str(value)
    return node


def bool_prop(parent: ET.Element, name: str, value: bool) -> ET.Element:
    node = ET.SubElement(parent, "boolProp", {"name": name})
    node.text = "true" if value else "false"
    return node


def int_prop(parent: ET.Element, name: str, value: int) -> ET.Element:
    node = ET.SubElement(parent, "intProp", {"name": name})
    node.text = str(value)
    return node


def component(parent: ET.Element, tag: str, testclass: str, guiclass: str, name: str) -> ET.Element:
    return ET.SubElement(
        parent,
        tag,
        {"guiclass": guiclass, "testclass": testclass, "testname": name, "enabled": "true"},
    )


def paired_component(parent: ET.Element, tag: str, testclass: str, guiclass: str, name: str) -> tuple[ET.Element, ET.Element]:
    node = component(parent, tag, testclass, guiclass, name)
    return node, ET.SubElement(parent, "hashTree")


def add_argument(collection: ET.Element, name: str, value: Any) -> None:
    arg = ET.SubElement(collection, "elementProp", {"name": name, "elementType": "Argument"})
    string_prop(arg, "Argument.name", name)
    string_prop(arg, "Argument.value", value)
    string_prop(arg, "Argument.metadata", "=")


def add_header_manager(parent: ET.Element, headers: dict[str, Any], name: str) -> None:
    manager, _ = paired_component(parent, "HeaderManager", "HeaderManager", "HeaderPanel", name)
    collection = ET.SubElement(manager, "collectionProp", {"name": "HeaderManager.headers"})
    for header_name, header_value in headers.items():
        item = ET.SubElement(collection, "elementProp", {"name": "", "elementType": "Header"})
        string_prop(item, "Header.name", header_name)
        string_prop(item, "Header.value", header_value)


def add_response_assertion(parent: ET.Element, name: str, field: str, expected: str, test_type: int) -> None:
    assertion, _ = paired_component(parent, "ResponseAssertion", "ResponseAssertion", "AssertionGui", name)
    values = ET.SubElement(assertion, "collectionProp", {"name": "Asserion.test_strings"})
    stable_name = hashlib.sha1(f"{name}\0{expected}".encode("utf-8")).hexdigest()[:16]
    value = ET.SubElement(values, "stringProp", {"name": stable_name})
    value.text = expected
    string_prop(assertion, "Assertion.custom_message", "")
    string_prop(assertion, "Assertion.test_field", field)
    bool_prop(assertion, "Assertion.assume_success", False)
    int_prop(assertion, "Assertion.test_type", test_type)


def add_json_extractor(parent: ET.Element, raw: dict[str, Any]) -> None:
    name = str(raw["name"])
    extractor, _ = paired_component(
        parent,
        "JSONPostProcessor",
        "JSONPostProcessor",
        "JSONPostProcessorGui",
        f"Extract {name}",
    )
    string_prop(extractor, "JSONPostProcessor.referenceNames", name)
    string_prop(extractor, "JSONPostProcessor.jsonPathExprs", raw["json_path"])
    string_prop(extractor, "JSONPostProcessor.match_numbers", raw.get("match_number", 1))
    string_prop(extractor, "JSONPostProcessor.defaultValues", raw.get("default", "NOT_FOUND"))
    string_prop(extractor, "JSONPostProcessor.compute_concat", "false")


def validate_config(config: dict[str, Any]) -> list[str]:
    errors: list[str] = []
    if not str(config.get("name", "")).strip():
        errors.append("name is required")
    parsed = urlparse(str(config.get("base_url", "")))
    if parsed.scheme not in {"http", "https"} or not parsed.hostname:
        errors.append("base_url must be an absolute HTTP or HTTPS URL")
    if parsed.username or parsed.password:
        errors.append("base_url must not contain embedded credentials")
    for field in ("threads", "ramp_up_seconds"):
        value = config.get(field)
        if not isinstance(value, int) or value < (1 if field == "threads" else 0):
            errors.append(f"{field} must be a valid integer")
    loops = config.get("loops", 1)
    duration = config.get("duration_seconds", 0)
    if not isinstance(loops, int) or loops < 1:
        errors.append("loops must be a positive integer")
    if not isinstance(duration, int) or duration < 0:
        errors.append("duration_seconds must be a non-negative integer")
    headers = config.get("headers", {})
    if not isinstance(headers, dict):
        errors.append("headers must be an object")
    else:
        errors.extend(validate_secret_headers(headers, "headers"))
    requests = config.get("requests")
    if not isinstance(requests, list) or not requests:
        errors.append("requests must be a non-empty array")
        return errors
    for index, request in enumerate(requests):
        prefix = f"requests[{index}]"
        if not isinstance(request, dict):
            errors.append(f"{prefix} must be an object")
            continue
        if not str(request.get("name", "")).strip():
            errors.append(f"{prefix}.name is required")
        method = str(request.get("method", "")).upper()
        if method not in METHODS:
            errors.append(f"{prefix}.method must be one of {sorted(METHODS)}")
        path = request.get("path")
        if not isinstance(path, str) or not path.startswith("/"):
            errors.append(f"{prefix}.path must begin with /")
        status = request.get("expected_status")
        if not isinstance(status, int) or not 100 <= status <= 599:
            errors.append(f"{prefix}.expected_status must be an HTTP status integer")
        if "headers" in request and not isinstance(request["headers"], dict):
            errors.append(f"{prefix}.headers must be an object")
        elif isinstance(request.get("headers"), dict):
            errors.extend(validate_secret_headers(request["headers"], f"{prefix}.headers"))
        if "body" in request:
            errors.extend(validate_secret_fields(request["body"], f"{prefix}.body"))
        extractors = request.get("json_extractors", [])
        if not isinstance(extractors, list):
            errors.append(f"{prefix}.json_extractors must be an array")
        else:
            for extractor_index, extractor in enumerate(extractors):
                if not isinstance(extractor, dict) or not extractor.get("name") or not extractor.get("json_path"):
                    errors.append(f"{prefix}.json_extractors[{extractor_index}] requires name and json_path")
    csv_config = config.get("csv")
    if csv_config is not None:
        if not isinstance(csv_config, dict):
            errors.append("csv must be an object")
        elif not csv_config.get("filename") or not csv_config.get("variable_names"):
            errors.append("csv requires filename and variable_names")
    return errors


def is_parameterized(value: Any) -> bool:
    return isinstance(value, str) and ("${" in value or "__P(" in value or "__env(" in value)


def validate_secret_headers(headers: dict[str, Any], location: str) -> list[str]:
    sensitive = {"authorization", "proxy-authorization", "cookie", "set-cookie", "x-api-key", "api-key"}
    errors = []
    for name, value in headers.items():
        if str(name).strip().lower() in sensitive and value and not is_parameterized(value):
            errors.append(f"{location}.{name} looks like a hardcoded secret; use a variable or JMeter property")
    return errors


def validate_secret_fields(value: Any, location: str) -> list[str]:
    sensitive = {"password", "passwd", "secret", "token", "access_token", "refresh_token", "api_key", "apikey"}
    errors = []
    if isinstance(value, dict):
        for key, child in value.items():
            child_location = f"{location}.{key}"
            if str(key).strip().lower() in sensitive and child and not is_parameterized(child):
                errors.append(f"{child_location} looks like a hardcoded secret; use a variable or JMeter property")
            errors.extend(validate_secret_fields(child, child_location))
    elif isinstance(value, list):
        for index, child in enumerate(value):
            errors.extend(validate_secret_fields(child, f"{location}[{index}]"))
    return errors


def add_test_plan_variables(test_plan: ET.Element, defaults: dict[str, str]) -> None:
    variables = ET.SubElement(
        test_plan,
        "elementProp",
        {
            "name": "TestPlan.user_defined_variables",
            "elementType": "Arguments",
            "guiclass": "ArgumentsPanel",
            "testclass": "Arguments",
            "testname": "User Defined Variables",
            "enabled": "true",
        },
    )
    collection = ET.SubElement(variables, "collectionProp", {"name": "Arguments.arguments"})
    for name, value in defaults.items():
        add_argument(collection, name, value)


def generate(config: dict[str, Any]) -> ET.ElementTree:
    parsed = urlparse(config["base_url"])
    port = parsed.port or ""
    base_path = parsed.path.rstrip("/")
    defaults = {
        "PROTOCOL": f"${{__P(PROTOCOL,{parsed.scheme})}}",
        "HOST": f"${{__P(HOST,{parsed.hostname})}}",
        "PORT": f"${{__P(PORT,{port})}}",
        "BASE_PATH": f"${{__P(BASE_PATH,{base_path})}}",
        "THREADS": f"${{__P(THREADS,{config['threads']})}}",
        "RAMP_UP": f"${{__P(RAMP_UP,{config['ramp_up_seconds']})}}",
        "LOOPS": f"${{__P(LOOPS,{config.get('loops', 1)})}}",
        "DURATION": f"${{__P(DURATION,{config.get('duration_seconds', 0)})}}",
    }

    root = ET.Element("jmeterTestPlan", {"version": "1.2", "properties": "5.0", "jmeter": "5.6.3"})
    root_tree = ET.SubElement(root, "hashTree")
    test_plan = component(root_tree, "TestPlan", "TestPlan", "TestPlanGui", config["name"])
    string_prop(test_plan, "TestPlan.comments", "Generated by QA-MDS performance-qa")
    bool_prop(test_plan, "TestPlan.functional_mode", False)
    bool_prop(test_plan, "TestPlan.tearDown_on_shutdown", True)
    bool_prop(test_plan, "TestPlan.serialize_threadgroups", False)
    add_test_plan_variables(test_plan, defaults)
    plan_tree = ET.SubElement(root_tree, "hashTree")

    http_defaults, _ = paired_component(
        plan_tree,
        "ConfigTestElement",
        "ConfigTestElement",
        "HttpDefaultsGui",
        "HTTP Request Defaults",
    )
    args_prop = ET.SubElement(http_defaults, "elementProp", {"name": "HTTPsampler.Arguments", "elementType": "Arguments"})
    ET.SubElement(args_prop, "collectionProp", {"name": "Arguments.arguments"})
    string_prop(http_defaults, "HTTPSampler.domain", "${HOST}")
    string_prop(http_defaults, "HTTPSampler.port", "${PORT}")
    string_prop(http_defaults, "HTTPSampler.protocol", "${PROTOCOL}")
    string_prop(http_defaults, "HTTPSampler.contentEncoding", "UTF-8")
    string_prop(http_defaults, "HTTPSampler.path", "")
    string_prop(http_defaults, "HTTPSampler.concurrentPool", "6")
    string_prop(http_defaults, "HTTPSampler.connect_timeout", "")
    string_prop(http_defaults, "HTTPSampler.response_timeout", "")

    if config.get("headers"):
        add_header_manager(plan_tree, config["headers"], "Global HTTP Headers")

    csv_config = config.get("csv")
    if csv_config:
        csv_node, _ = paired_component(plan_tree, "CSVDataSet", "CSVDataSet", "TestBeanGUI", "CSV Test Data")
        string_prop(csv_node, "delimiter", csv_config.get("delimiter", ","))
        string_prop(csv_node, "fileEncoding", "UTF-8")
        string_prop(csv_node, "filename", csv_config["filename"])
        bool_prop(csv_node, "ignoreFirstLine", bool(csv_config.get("ignore_first_line", False)))
        bool_prop(csv_node, "quotedData", bool(csv_config.get("quoted_data", True)))
        bool_prop(csv_node, "recycle", bool(csv_config.get("recycle", True)))
        string_prop(csv_node, "shareMode", csv_config.get("share_mode", "shareMode.all"))
        bool_prop(csv_node, "stopThread", bool(csv_config.get("stop_thread", False)))
        string_prop(csv_node, "variableNames", csv_config["variable_names"])

    thread_group, thread_tree = paired_component(plan_tree, "ThreadGroup", "ThreadGroup", "ThreadGroupGui", config["name"])
    string_prop(
        thread_group,
        "ThreadGroup.on_sample_error",
        "stoptestnow" if config.get("abort_on_failure") else "continue",
    )
    loop = ET.SubElement(
        thread_group,
        "elementProp",
        {
            "name": "ThreadGroup.main_controller",
            "elementType": "LoopController",
            "guiclass": "LoopControlPanel",
            "testclass": "LoopController",
            "testname": "Loop Controller",
            "enabled": "true",
        },
    )
    bool_prop(loop, "LoopController.continue_forever", False)
    string_prop(loop, "LoopController.loops", "${LOOPS}")
    string_prop(thread_group, "ThreadGroup.num_threads", "${THREADS}")
    string_prop(thread_group, "ThreadGroup.ramp_time", "${RAMP_UP}")
    bool_prop(thread_group, "ThreadGroup.scheduler", config.get("duration_seconds", 0) > 0)
    string_prop(thread_group, "ThreadGroup.duration", "${DURATION}" if config.get("duration_seconds", 0) > 0 else "")
    string_prop(thread_group, "ThreadGroup.delay", "")
    bool_prop(thread_group, "ThreadGroup.same_user_on_next_iteration", True)

    think_time = int(config.get("think_time_ms", 0))
    variation = int(config.get("think_time_variation_ms", 0))
    if think_time or variation:
        timer, _ = paired_component(
            thread_tree,
            "UniformRandomTimer",
            "UniformRandomTimer",
            "UniformRandomTimerGui",
            "Think Time",
        )
        string_prop(timer, "ConstantTimer.delay", max(0, think_time - variation))
        string_prop(timer, "RandomTimer.range", max(0, variation * 2))

    target_rps = float(config.get("target_rps", 0) or 0)
    if target_rps > 0:
        throughput, _ = paired_component(
            thread_tree,
            "ConstantThroughputTimer",
            "ConstantThroughputTimer",
            "TestBeanGUI",
            "Target Request Rate",
        )
        string_prop(throughput, "throughput", target_rps * 60)
        int_prop(throughput, "calcMode", 1)

    for request in config["requests"]:
        sampler, sampler_tree = paired_component(
            thread_tree,
            "HTTPSamplerProxy",
            "HTTPSamplerProxy",
            "HttpTestSampleGui",
            request["name"],
        )
        arguments = ET.SubElement(sampler, "elementProp", {"name": "HTTPsampler.Arguments", "elementType": "Arguments"})
        collection = ET.SubElement(arguments, "collectionProp", {"name": "Arguments.arguments"})
        has_body = "body" in request
        if has_body:
            body = request["body"]
            if not isinstance(body, str):
                body = json.dumps(body, ensure_ascii=False, separators=(",", ":"))
            argument = ET.SubElement(collection, "elementProp", {"name": "", "elementType": "HTTPArgument"})
            bool_prop(argument, "HTTPArgument.always_encode", False)
            string_prop(argument, "Argument.value", body)
            string_prop(argument, "Argument.metadata", "=")
        string_prop(sampler, "HTTPSampler.path", f"${{BASE_PATH}}{request['path']}")
        string_prop(sampler, "HTTPSampler.method", request["method"].upper())
        bool_prop(sampler, "HTTPSampler.follow_redirects", True)
        bool_prop(sampler, "HTTPSampler.auto_redirects", False)
        bool_prop(sampler, "HTTPSampler.use_keepalive", True)
        bool_prop(sampler, "HTTPSampler.DO_MULTIPART_POST", False)
        bool_prop(sampler, "HTTPSampler.postBodyRaw", has_body)
        string_prop(sampler, "HTTPSampler.embedded_url_re", "")
        timeout = request.get("timeout_ms", "")
        string_prop(sampler, "HTTPSampler.connect_timeout", timeout)
        string_prop(sampler, "HTTPSampler.response_timeout", timeout)

        if request.get("headers"):
            add_header_manager(sampler_tree, request["headers"], f"{request['name']} Headers")
        add_response_assertion(
            sampler_tree,
            f"{request['name']} Status",
            "Assertion.response_code",
            str(request["expected_status"]),
            8,
        )
        if request.get("response_contains") is not None:
            add_response_assertion(
                sampler_tree,
                f"{request['name']} Body Contains",
                "Assertion.response_data",
                str(request["response_contains"]),
                2,
            )
        for extractor in request.get("json_extractors", []):
            add_json_extractor(sampler_tree, extractor)

    ET.indent(root, space="  ")
    return ET.ElementTree(root)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--config", required=True)
    parser.add_argument("--output")
    parser.add_argument("--validate-only", action="store_true")
    args = parser.parse_args()
    if not args.validate_only and not args.output:
        parser.error("--output is required unless --validate-only is used")
    try:
        config = json.loads(Path(args.config).read_text(encoding="utf-8"))
        if not isinstance(config, dict):
            raise ValueError("Config root must be an object")
        errors = validate_config(config)
        if errors:
            print(json.dumps({"passed": False, "errors": errors}, ensure_ascii=False, indent=2))
            return 2
        tree = generate(config)
        xml_payload = ET.tostring(tree.getroot(), encoding="utf-8", xml_declaration=True)
        ET.fromstring(xml_payload)
        if args.output:
            output = Path(args.output)
            output.parent.mkdir(parents=True, exist_ok=True)
            output.write_bytes(xml_payload + b"\n")
        print(
            json.dumps(
                {
                    "passed": True,
                    "output": str(Path(args.output).resolve()) if args.output else None,
                    "requests": len(config["requests"]),
                    "threads": config["threads"],
                    "ramp_up_seconds": config["ramp_up_seconds"],
                    "loops": config.get("loops", 1),
                    "duration_seconds": config.get("duration_seconds", 0),
                },
                ensure_ascii=False,
                indent=2,
            )
        )
        return 0
    except (OSError, ValueError, json.JSONDecodeError, ET.ParseError) as exc:
        print(json.dumps({"passed": False, "error": str(exc)}, ensure_ascii=False), file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
