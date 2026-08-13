import os
import sys

sys.path.insert(0, os.path.dirname(__file__))

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)

print("== 1. GET /api/health ==")
print(client.get("/api/health").status_code, client.get("/api/health").json())

print("\n== 2. POST /api/ai/chat — complaint paragraph (should return schema JSON in 'extracted') ==")
para = (
    "Customer: Acme Pharmaceuticals. Product: Paracetamol 500mg Tablets, "
    "Batch/Lot B24XR-0087. Strength: 500 mg / USP Grade. "
    "Two tablets inside the blister were found cracked on opening the pack. "
    "Packaging shows signs of moisture ingress. Reported by the regional "
    "distributor via email. Severity medium."
)
r = client.post("/api/ai/chat", json={"message": para, "context": None})
print(r.status_code)
body = r.json()
print("reply:", body.get("reply"))
print("extracted keys:", sorted(body.get("extracted", {}).keys()))

print("\n== 3. POST /api/ai/chat — EDIT: change batch + qty, preserve other fields ==")
edit_msg = "Actually, the batch number is ABC-999 and the quantity affected is 12."
r = client.post(
    "/api/ai/chat",
    json={
        "message": edit_msg,
        "context": {
            "form": {
                "customerName": "Acme Pharmaceuticals",
                "productName": "Paracetamol 500mg Tablets",
                "productStrength": "500 mg / USP Grade",
                "batchNumber": "B24XR-0087",
                "complaintType": "Packaging Issue",
                "description": "Two tablets cracked on opening the pack.",
                "severity": "Medium — Moderate, localized impact",
                "priority": "Normal",
            }
        },
    },
)
print(r.status_code)
eb = r.json()
print("reply:", eb.get("reply"))
print("extracted (diff):", eb.get("extracted"))
assert set(eb.get("extracted", {}).keys()) <= {"batch_number", "quantity_affected", "description"}, "Edit touched fields it should not!"

print("\n== 4. POST /api/ai/chat — plain question (should route to assistant) ==")
r = client.post(
    "/api/ai/chat",
    json={"message": "What is the severity of this complaint?", "context": {"form": {"batchNumber": "B24XR-0087"}}},
)
print(r.status_code, r.json())

print("\n== 4. POST /api/ai/extract — multipart txt upload ==")
files = {
    "file": (
        "complaint.txt",
        "Customer: Acme Pharmaceuticals\nProduct: Paracetamol 500mg Tablets\nBatch/Lot Number: B24XR-0087\nSeverity: Medium\nComplaint Type: Packaging Issue\nTwo tablets cracked on opening the pack.",
        "text/plain",
    )
}
r = client.post("/api/ai/extract", files=files)
print(r.status_code)
eb = r.json()
print("fileName:", eb.get("fileName"))
print("fields:", eb.get("fields"))

print("\n== 5. POST /api/ai/extract — PDF upload -> LLM extraction -> form fields ==")


def make_pdf(path, lines):
    content = b" ".join(f"({line}) Tj".encode("latin-1") for line in lines)
    stream = b"BT /F1 12 Tf 72 720 Td " + content + b" ET"
    objs = [
        b"1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n",
        b"2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj\n",
        b"3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] "
        b"/Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >> endobj\n",
        b"4 0 obj << /Length " + str(len(stream)).encode() + b" >> stream\n"
        + stream + b"\nendstream endobj\n",
        b"5 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj\n",
    ]
    out = b"%PDF-1.4\n"
    offsets = [0]
    for obj in objs:
        offsets.append(len(out))
        out += obj
    xref_pos = len(out)
    xref = b"xref\n0 6\n" + b"0000000000 65535 f \n"
    for i in range(1, 6):
        xref += b"%010d 00000 n \n" % offsets[i]
    out += xref
    out += b"trailer << /Size 6 /Root 1 0 R >>\nstartxref\n" + str(xref_pos).encode() + b"\n%%EOF"
    with open(path, "wb") as fh:
        fh.write(out)


make_pdf(
    "test_complaint.pdf",
    [
        "Customer: Acme Pharmaceuticals",
        "Product: Paracetamol 500mg Tablets",
        "Batch/Lot Number: B24XR-0087",
        "Strength: 500 mg / USP Grade",
        "Quantity: 6",
        "Manufacturing Date: 12/04/2026",
        "Expiry Date: 11/04/2028",
        "Complaint Date: 08/08/2026",
        "Complaint Type: Packaging Issue",
        "Severity: Medium",
        "Two tablets inside the blister were found cracked on opening the pack.",
        "Packaging shows signs of moisture ingress.",
        "(email) reported by the regional distributor.",
    ],
)
with open("test_complaint.pdf", "rb") as fh:
    r = client.post("/api/ai/extract", files={"file": ("test_complaint.pdf", fh.read(), "application/pdf")})
print(r.status_code)
pdf_fields = r.json().get("fields", {})
for k in ("customer_name", "product_name", "batch_number", "complaint_type", "severity"):
    print(f"  {k}: {pdf_fields.get(k)}")
assert pdf_fields.get("batch_number") == "B24XR-0087"

print("\n== 6. POST /api/complaints (camelCase) ==")
r = client.post(
    "/api/complaints",
    json={
        "complaintSource": "Email",
        "customerName": "Acme Pharmaceuticals",
        "productName": "Paracetamol 500mg Tablets",
        "batchNumber": "B24XR-0087",
        "complaintType": "Packaging Issue",
        "description": "Cracked tablets in blister.",
        "severity": "Medium — Moderate, localized impact",
        "priority": "Normal",
    },
)
print(r.status_code, r.json())

print("\n== 6. POST /api/complaints — missing required fields (expect 400) ==")
r = client.post("/api/complaints", json={"customerName": "Acme"})
print(r.status_code, r.json())

print("\n== 7. GET /api/complaints (camelCase out) ==")
r = client.get("/api/complaints")
print(r.status_code)
print(r.json())