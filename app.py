from __future__ import annotations

import os
from datetime import datetime
from decimal import Decimal, DecimalException, InvalidOperation, ROUND_HALF_UP

from flask import Flask, jsonify, redirect, render_template, request, url_for

app = Flask(__name__)


def parse_date(value: str):
    if value is None or str(value).strip() == "":
        raise ValueError("Date is required.")

    cleaned = str(value).strip()
    for fmt in ("%m/%d/%Y", "%Y-%m-%d"):
        try:
            return datetime.strptime(cleaned, fmt).date()
        except ValueError:
            continue

    raise ValueError("Use MM/DD/YYYY or YYYY-MM-DD.")


def parse_decimal(value, label: str) -> Decimal:
    if value is None or str(value).strip() == "":
        raise ValueError(f"{label} is required.")

    try:
        parsed = Decimal(str(value).strip())
    except InvalidOperation as exc:
        raise ValueError(f"Invalid {label}.") from exc
    if not parsed.is_finite():
        raise ValueError(f"{label} must be a finite number.")
    if parsed < 0:
        raise ValueError(f"{label} cannot be negative.")
    return parsed


def json_object():
    payload = request.get_json(silent=True)
    if not isinstance(payload, dict):
        return None, (jsonify({"success": False, "error": "Request body must be a JSON object."}), 400)
    return payload, None


def format_decimal(value: Decimal, digits: int = 2) -> str:
    quantizer = Decimal("1") if digits == 0 else Decimal("0." + ("0" * (digits - 1)) + "1")
    quantized = value.quantize(quantizer, rounding=ROUND_HALF_UP)
    return format(quantized, f".{digits}f")


def calculate_days_on_market(listing_date, sale_date):
    listing = parse_date(listing_date)
    sale = parse_date(sale_date)

    if sale < listing:
        raise ValueError("Sale date must be on or after the listing date.")

    return (sale - listing).days


@app.route("/")
def home():
    return render_template("workspace.html")


@app.route("/workspace")
def workspace():
    return redirect(url_for("home"))


@app.route("/api/dom", methods=["POST"])
def api_dom():
    payload, error = json_object()
    if error:
        return error

    try:
        if payload.get("entries") is not None:
            entries = payload.get("entries")
            if not isinstance(entries, list):
                raise ValueError("Bulk entries must be provided as a list.")

            results = []
            for item in entries:
                if not isinstance(item, dict):
                    raise ValueError("Each bulk entry must be an object with listing_date and sale_date.")
                days = calculate_days_on_market(item.get("listing_date"), item.get("sale_date"))
                results.append({
                    "listing_date": item.get("listing_date"),
                    "sale_date": item.get("sale_date"),
                    "days": days,
                })

            return jsonify({"success": True, "results": results, "count": len(results)})

        days = calculate_days_on_market(payload.get("listing_date"), payload.get("sale_date"))
        return jsonify({"success": True, "days": days, "formatted": f"{days} days"})
    except ValueError as exc:
        return jsonify({"success": False, "error": str(exc)}), 400


@app.route("/api/acre", methods=["POST"])
def api_acre():
    payload, error = json_object()
    if error:
        return error

    try:
        if payload.get("entries") is not None:
            entries = payload.get("entries")
            if not isinstance(entries, list):
                raise ValueError("Bulk entries must be provided as a list.")

            results = []
            for item in entries:
                if not isinstance(item, dict):
                    raise ValueError("Each bulk entry must be an object with acres value.")
                acres = parse_decimal(item.get("acres"), "Acres")
                sqft = acres * Decimal("43560")
                results.append({
                    "acres": format_decimal(acres, 4),
                    "square_feet": format_decimal(sqft, 2),
                })

            return jsonify({"success": True, "results": results, "count": len(results)})

        acres = parse_decimal(payload.get("acres"), "Acres")
        sqft = acres * Decimal("43560")
        return jsonify({
            "success": True,
            "acres": format_decimal(acres, 4),
            "square_feet": format_decimal(sqft, 2),
            "formatted": f"{format_decimal(acres, 4)} acres = {format_decimal(sqft, 2)} sq ft",
        })
    except DecimalException:
        return jsonify({
            "success": False,
            "error": "Acre value is outside the supported calculation range.",
        }), 400
    except ValueError as exc:
        return jsonify({"success": False, "error": str(exc)}), 400


if __name__ == "__main__":
    app.run(
        host="0.0.0.0",
        port=int(os.environ.get("PORT", "5000")),
        debug=False,
    )
