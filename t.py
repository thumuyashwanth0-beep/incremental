import requests

payload = {
    'message': 'how are u',
    'provider': 'groq'
}

print(requests.post('https://on-a-new-mission.onrender.com/api/chat', json = payload).json())