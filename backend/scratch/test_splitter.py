import re

def smart_sentence_splitter(text: str):
    if not text:
        return []

    all_sentences = []
    # Divide por quebras de linha para respeitar cada parágrafo original
    raw_paras = [p.strip() for p in text.split('\n') if p.strip()]

    for p in raw_paras:
        # Look-behind de largura fixa
        p_sentences = re.split(r'(?<=[.!?…])\s+|(?<=[.!?…][\"”»\'])\s+', p)
        p_sentences = [s.strip() for s in p_sentences if s.strip()]

        for i, sent in enumerate(p_sentences):
            if i == len(p_sentences) - 1:
                all_sentences.append(sent + '\n')
            else:
                all_sentences.append(sent)

    return all_sentences

sample = '''O que ele está imaginando com essa história?
"Nesse sentido, você é que é verdadeiramente estranho."
Snowfield murmurou algo com um olhar de pena.
"Você, que preza as pessoas mais do que ninguém, descarta descuidadamente o próprio eu que elas amam."
Snowfield tem razão. Eu, que escolhi desaparecer neste mundo arriscando tudo, posso ser, na verdade, muito mais estranho do que eles.
"Ainda."
Apertei ainda mais o peito de Snowfield e falei. Como se rebelasse contra a minha força, a história de Snowfield arranhou minha mão com ainda mais força.'''

sents = smart_sentence_splitter(sample)
for idx, s in enumerate(sents):
    print(f'Sent {idx}: {repr(s)}')
