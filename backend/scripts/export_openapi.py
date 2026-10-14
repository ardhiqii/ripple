"""Export the FastAPI contract and its generated frontend TypeScript types."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.main import create_app  # noqa: E402, I001


METHODS = ("get", "post", "put", "patch", "delete", "options", "head")


def openapi_document() -> dict[str, Any]:
    return create_app().openapi()


def render_json(document: dict[str, Any]) -> str:
    return json.dumps(document, indent=2, sort_keys=True) + "\n"


def type_from_schema(schema: dict[str, Any]) -> str:
    if "$ref" in schema:
        name = schema["$ref"].rsplit("/", maxsplit=1)[-1]
        return f'components["schemas"]["{name}"]'
    if "oneOf" in schema or "anyOf" in schema:
        key = "oneOf" if "oneOf" in schema else "anyOf"
        return " | ".join(type_from_schema(item) for item in schema[key]) or "unknown"
    if "allOf" in schema:
        return " & ".join(type_from_schema(item) for item in schema["allOf"]) or "unknown"
    if "enum" in schema:
        return " | ".join(json.dumps(value) for value in schema["enum"])
    if schema.get("type") == "array":
        return f"Array<{type_from_schema(schema.get('items', {}))}>"
    if schema.get("type") == "object" or "properties" in schema:
        properties = schema.get("properties", {})
        if not properties:
            return "Record<string, unknown>"
        required = set(schema.get("required", []))
        fields = [
            f"{json.dumps(name)}{'?' if name not in required else ''}: {type_from_schema(value)};"
            for name, value in sorted(properties.items())
        ]
        return "{ " + " ".join(fields) + " }"
    return {
        "integer": "number",
        "number": "number",
        "boolean": "boolean",
        "string": "string",
    }.get(schema.get("type"), "unknown")


def render_schema(name: str, schema: dict[str, Any]) -> list[str]:
    if schema.get("type") == "object" or "properties" in schema:
        required = set(schema.get("required", []))
        lines = [f"  export interface {name} {{"]
        for property_name, property_schema in sorted(schema.get("properties", {}).items()):
            optional = "?" if property_name not in required else ""
            lines.append(
                f"    {json.dumps(property_name)}{optional}: {type_from_schema(property_schema)};"
            )
        lines.append("  }")
        return lines
    return [f"  export type {name} = {type_from_schema(schema)}"]


def render_types(document: dict[str, Any]) -> str:
    schemas = document.get("components", {}).get("schemas", {})
    lines = [
        "// GENERATED FILE - DO NOT EDIT.",
        "// Source: backend/app FastAPI OpenAPI schema.",
        "// Regenerate with: npm run api:generate",
        "",
        "export interface components {",
        "  schemas: {",
    ]
    for name in sorted(schemas):
        lines.append(f"    {json.dumps(name)}: {name};")
    lines.extend(["  }", "}", ""])
    for name in sorted(schemas):
        lines.extend(render_schema(name, schemas[name]))
        lines.append("")

    lines.extend(["export interface paths {"])
    for path, path_item in sorted(document.get("paths", {}).items()):
        lines.append(f"  {json.dumps(path)}: {{")
        for method in METHODS:
            operation = path_item.get(method)
            if not operation:
                continue
            lines.extend([f"    {method}: {{", "      responses: {"])
            for status, response in sorted(operation.get("responses", {}).items()):
                lines.append(f"        {json.dumps(status)}: {{")
                content = response.get("content", {})
                if content:
                    lines.extend(["          content:", "            {"])
                    for content_type, content_schema in sorted(content.items()):
                        schema = content_schema.get("schema", {})
                        lines.append(
                            f"              {json.dumps(content_type)}: "
                            f"{type_from_schema(schema)};"
                        )
                    lines.extend(["            }"])
                else:
                    lines.append("          content: Record<string, never>;")
                lines.append("        };")
            lines.extend(["      };", "    };"])
        lines.extend(["  };"])
    lines.append("}")
    return "\n".join(lines) + "\n"


def write_or_check(path: Path, content: str, check: bool) -> bool:
    if check:
        if not path.exists() or path.read_text(encoding="utf-8") != content:
            print(f"OpenAPI generated artifact is stale: {path}", file=sys.stderr)
            return False
        return True
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")
    return True


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--openapi-output", type=Path, required=True)
    parser.add_argument("--types-output", type=Path, required=True)
    parser.add_argument(
        "--check",
        action="store_true",
        help="fail when either generated artifact is stale",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    document = openapi_document()
    artifacts = (
        (args.openapi_output, render_json(document)),
        (args.types_output, render_types(document)),
    )
    return 0 if all(write_or_check(path, content, args.check) for path, content in artifacts) else 1


if __name__ == "__main__":
    raise SystemExit(main())
