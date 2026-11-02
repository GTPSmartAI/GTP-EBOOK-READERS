import asyncio
import edge_tts
import os
import re

def format_narration_with_acting(text: str, cadence: str = "natural", emotion: str = "suspense") -> str:
    if not text:
        return ""

    t = re.sub(r'[“"„«]', '"', text)
    t = re.sub(r'[”"»]', '"', t)
    t = re.sub(r'[—–]', '—', t)

    def _speech_mod(m):
        dialogue = m.group(1).strip()
        return f' ... "{dialogue}" ... '

    t = re.sub(r'"([^"]+)"', _speech_mod, t)

    if cadence == "espacosa":
        t = re.sub(r'([.!?])\s+', r'\1 ... ', t)
    elif cadence == "dramatica":
        t = re.sub(r'([.!?])\s+', r'\1 ... ', t)

    # Normaliza reticências e espaços para no máximo uma pausa limpa
    t = re.sub(r'(\s*\.\.\.\s*)+', ' ... ', t)
    t = re.sub(r'\s{2,}', ' ', t)
    return t.strip()

async def run():
    phrase = '"Nesse sentido, você é que é verdadeiramente estranho." Snowfield murmurou algo com um olhar de pena. "Você, que preza as pessoas mais do que ninguém, descarta descuidadamente o próprio eu que elas amam."'
    processed = format_narration_with_acting(phrase, cadence="dramatica")
    print("Texto processado:", processed)

    comm = edge_tts.Communicate(processed, 'en-US-BrianMultilingualNeural', rate='+0%', pitch='-2Hz')
    await comm.save('test_acting_brian.mp3')
    print("Gerado com sucesso! Tamanho:", os.path.getsize('test_acting_brian.mp3'))

asyncio.run(run())
