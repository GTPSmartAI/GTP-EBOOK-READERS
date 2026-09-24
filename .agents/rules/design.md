---
trigger: always_on
---

# 🎨 Design System

## Filosofia Visual

O sistema adota uma estética **Soft & Bold** com tons de **Cyber-Dark** que combina suavidade moderna com elementos ousados, expressivos e bordas neon sutis.

**Soft (Suave)**
- Bordas arredondadas generosas (`rounded-[2rem]` ou `[2.5rem]`)
- Sombras suaves e orgânicas
- Fundos com desfoque (glassmorphism)
- Espaçamento amplo e respirável

**Bold (Ousado)**
- Tipografia em caixa alta com tracking largo
- Cores vibrantes (Emerald, Pink, Blue) para destaques
- Alto contraste no modo escuro profundo (`bg-black` ou `bg-slate-950`)
- Elementos interativos responsivos com micro-animações

**Padrões de Interface (2026)**
- **Headers de Página:** Container com bordas arredondadas máximas, fundo escuro (`bg-slate-900/50`), bordas finas com baixa opacidade e títulos em caixa alta.
- **Cards de Status:** Fundo escuro sólido, bordas sutis com gradiente superior indicando o status (ex: Rosa para "Qualificado", Verde para "Concluído").
- **Toggles/Switches:** Uso ostensivo de switches de alta visibilidade para controle de ativação.

---

## 🎨 Tokens de Cor

### Cor Primária (Brand)

```css
--brand-50:  #ecfdf5
--brand-500: #10b981
--brand-600: #059669
```

**Uso:** Ações principais, CTAs, elementos ativos, destaques importantes

**Conceito:** Crescimento, prosperidade e sucesso

### Cores Neutras

**Light Mode**
```css
--background: #f8fafc    /* slate-50 */
--surface:    #ffffff    /* white */
--border:     #e2e8f0    /* slate-200 */
--text-primary:   #0f172a /* slate-900 */
--text-secondary: #64748b /* slate-500 */
```

**Dark Mode**
```css
--background: #0a0a0a    /* deep black */
--surface:    #0f172a    /* slate-900 */
--border:     #1e293b    /* slate-800 */
--text-primary:   #f1f5f9 /* slate-100 */
--text-secondary: #94a3b8 /* slate-400 */
```

### Cores Semânticas

```css
--success: #10b981  /* emerald-500 */
--error:   #ef4444  /* red-500 */
--warning: #f59e0b  /* amber-500 */
--info:    #3b82f6  /* blue-500 */
```

---

## ✍️ Tipografia

**Fonte:** Inter (Google Fonts)

### Hierarquia

**Títulos (Headings)**
```css
font-weight: 900        /* font-black */
letter-spacing: -0.025em /* tracking-tight */
text-transform: uppercase
```

**Micro-Labels**
```css
font-size: 10px         /* text-[10px] */
font-weight: 700        /* font-bold */
text-transform: uppercase
letter-spacing: 0.1em   /* tracking-widest */
```

**Corpo (Body)**
```css
font-size: 14px         /* text-sm */
font-weight: 500        /* font-medium */
```

### Escala Tipográfica

| Token | Size | Weight | Usage |
|-------|------|--------|-------|
| `display` | 48px | 900 | Páginas especiais |
| `h1` | 32px | 900 | Título principal |
| `h2` | 24px | 900 | Seções importantes |
| `h3` | 20px | 900 | Subtítulos |
| `label` | 10px | 700 | Rótulos e badges |
| `body` | 14px | 500 | Texto padrão |
| `caption` | 12px | 500 | Legendas |

---

## 📐 Espaçamento

### Sistema de Espaçamento (8pt Grid)

```css
--space-1: 4px
--space-2: 8px
--space-3: 12px
--space-4: 16px
--space-6: 24px
--space-8: 32px
--space-12: 48px
--space-16: 64px
```

### Border Radius

```css
--radius-sm:   8px   /* rounded-lg */
--radius-md:   12px  /* rounded-xl */
--radius-lg:   16px  /* rounded-2xl */
--radius-xl:   32px  /* rounded-[2rem] */
--radius-full: 9999px /* rounded-full */
```

**Aplicação:**
- Inputs/Botões: `--radius-md` (12px)
- Cards/Modais: `--radius-xl` (32px)
- Badges: `--radius-full`

---

## 🧩 Componentes

### Botões

**Primário**
```css
background: var(--brand-500)
color: white
padding: 12px 24px
border-radius: var(--radius-md)
font-weight: 900
font-size: 10px
text-transform: uppercase
letter-spacing: 0.1em
box-shadow: 0 10px 15px -3px rgb(0 0 0 / 0.1)
transition: all 300ms

/* Hover */
background: var(--brand-600)
box-shadow: 0 20px 25px -5px rgb(0 0 0 / 0.1)

/* Active */
transform: scale(0.95)
```

**Secundário**
```css
background: transparent
color: var(--text-primary)
border: 1px solid var(--border)
/* Demais propriedades iguais ao primário */
```

### Inputs

```css
padding: 12px 16px
border-radius: var(--radius-md)
border: 1px solid var(--border)
font-size: 14px
transition: all 300ms

/* Focus */
outline: none
border-color: var(--brand-500)
box-shadow: 0 0 0 3px rgba(16, 185, 129, 0.1)
```

### Cards

```css
background: var(--surface)
border: 1px solid var(--border)
border-radius: var(--radius-xl)
padding: 24px
box-shadow: 0 1px 3px 0 rgb(0 0 0 / 0.1)
transition: all 300ms

/* Hover */
border-color: rgba(16, 185, 129, 0.3)
box-shadow: 0 20px 25px -5px rgb(0 0 0 / 0.1)
```

### Modais

```css
background: var(--surface)
border-radius: var(--radius-xl)
max-width: 600px
padding: 32px

/* Backdrop */
background: rgba(0, 0, 0, 0.5)
backdrop-filter: blur(8px)
```

### Badges

```css
display: inline-flex
padding: 4px 12px
border-radius: var(--radius-full)
font-size: 10px
font-weight: 700
text-transform: uppercase
letter-spacing: 0.05em
```

**Variantes:**
- Success: `background: #ecfdf5; color: #10b981`
- Error: `background: #fef2f2; color: #ef4444`
- Warning: `background: #fffbeb; color: #f59e0b`

---

## 🎭 Efeitos e Animações

### Transições

```css
/* Padrão para elementos interativos */
transition: all 300ms cubic-bezier(0.4, 0, 0.2, 1)
```

### Sombras

```css
--shadow-sm: 0 1px 2px 0 rgb(0 0 0 / 0.05)
--shadow-md: 0 4px 6px -1px rgb(0 0 0 / 0.1)
--shadow-lg: 0 10px 15px -3px rgb(0 0 0 / 0.1)
--shadow-xl: 0 20px 25px -5px rgb(0 0 0 / 0.1)
```

### Glassmorphism

```css
background: rgba(255, 255, 255, 0.1)
backdrop-filter: blur(12px)
border: 1px solid rgba(255, 255, 255, 0.2)
```

### Animações Customizadas

**Fade In**
```css
@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}
```

**Slide In**
```css
@keyframes slideIn {
  from { 
    opacity: 0;
    transform: translateY(20px);
  }
  to { 
    opacity: 1;
    transform: translateY(0);
  }
}
```

**Scale In**
```css
@keyframes scaleIn {
  from { 
    opacity: 0;
    transform: scale(0.95);
  }
  to { 
    opacity: 1;
    transform: scale(1);
  }
}
```

---

## 📱 Responsividade

### Breakpoints

```css
--mobile:  640px   /* sm */
--tablet:  768px   /* md */
--desktop: 1024px  /* lg */
--wide:    1280px  /* xl */
```

### Princípios Mobile-First

1. Design primeiro para mobile
2. Adicione complexidade para telas maiores
3. Touch targets mínimos de 44x44px
4. Espaçamento generoso em mobile

---

## ✅ Boas Práticas

### Acessibilidade

- Contraste mínimo 4.5:1 para textos
- Focus states visíveis em todos elementos interativos
- Labels descritivos em formulários
- Suporte a navegação por teclado

### Performance

- Use transições apenas em `transform` e `opacity`
- Prefira `will-change` para animações complexas
- Limite blur effects em elementos grandes

### Consistência

- Mantenha espaçamento uniforme (múltiplos de 4px)
- Use a paleta de cores definida
- Reutilize componentes em vez de criar variações

---

## 📦 Exemplo de Uso

```html
<!-- Card Exemplo -->
<div class="
  bg-white dark:bg-slate-900 
  rounded-[2rem] 
  border border-slate-200 dark:border-slate-800 
  p-6 
  shadow-sm hover:shadow-xl 
  hover:border-brand-500/30 
  transition-all duration-300
">
  <!-- Micro-Label -->
  <span class="
    text-[10px] 
    font-black 
    text-slate-400 
    uppercase 
    tracking-widest
  ">
    Categoria
  </span>
  
  <!-- Título -->
  <h3 class="
    text-xl 
    font-black 
    text-slate-800 dark:text-white 
    tracking-tight 
    mt-2
  ">
    Título do Card
  </h3>
  
  <!-- Botão -->
  <button class="
    w-full 
    mt-4 
    bg-brand-500 hover:bg-brand-600 
    text-white 
    py-3 
    rounded-xl 
    font-black 
    text-xs 
    uppercase 
    tracking-widest 
    shadow-lg 
    active:scale-95 
    transition-all
  ">
    Ação Principal
  </button>
</div>
```

---

**Versão:** 1.0.0  
**Última Atualização:** Fevereiro 2026