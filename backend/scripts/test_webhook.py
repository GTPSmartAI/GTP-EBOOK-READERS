import requests
import json
import time

def test_payment_webhook():
    url = "http://localhost:4000/api/webhooks/payment"
    
    mock_payload = {
        "event": "order_approved",
        "email": "leitor.teste@elevenreader.com",
        "plan": "pro_monthly",
        "amount": 29.90,
        "status": "paid",
        "gateway": "kiwify",
        "order_id": f"ord_{int(time.time())}",
        "customer": {
            "name": "Leitor Teste",
            "email": "leitor.teste@elevenreader.com"
        }
    }

    print(f"Enviando webhook de teste para {url}...")
    try:
        resp = requests.post(url, json=mock_payload, timeout=5)
        print(f"Status Code: {resp.status_code}")
        print("Resposta:", json.dumps(resp.json(), indent=2, ensure_ascii=False))
    except Exception as e:
        print(f"Erro ao conectar com a API: {e}")

if __name__ == "__main__":
    test_payment_webhook()
