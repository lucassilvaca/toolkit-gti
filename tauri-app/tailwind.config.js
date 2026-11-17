/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Identidade "Verde-azulado" (2026-11): tema claro, verde-azulado escuro + médio.
        // Nomes semânticos mantidos para que todas as views herdem a troca.
        base: '#f4f8f7',          // fundo da janela (verde-acinzentado pálido)
        surface: {
          DEFAULT: '#ffffff',     // cards
          raised: '#f8fbfa',      // linhas/itens dentro de cards
          overlay: '#e8f1ef',     // hover, trilhos de barra, chips
        },
        line: {
          DEFAULT: '#dce8e5',
          strong: '#b9d6d0',      // borda em hover/destaque
        },
        ink: {
          DEFAULT: '#34433f',
          strong: '#13201e',
          muted: '#4f5f5b',
          faint: '#5d6c68',      // mínimo AA (4.5:1) sobre base/surface
        },
        accent: {
          DEFAULT: '#0f766e',     // verde-azulado (ação principal)
          strong: '#134e4a',      // verde-azulado escuro
          soft: '#115e59',        // texto/ícone de destaque sobre fundo claro
          tint: '#d5efea',        // fundos suaves (item ativo, chips)
          blush: '#b8e3db',       // tint em hover
        },
        success: '#1c7c4c',
        warning: '#8f5b00',
        danger: '#c0394b',
      },
      fontFamily: {
        sans: ['"DM Sans Variable"', '"DM Sans"', '"Segoe UI"', 'system-ui', 'sans-serif'],
        display: ['"Fraunces Variable"', '"Fraunces"', 'Georgia', 'serif'],
      },
      borderRadius: {
        card: '28px',
        item: '16px',
      },
      boxShadow: {
        soft: '0 10px 40px rgba(19, 78, 74, 0.08)',
        lift: '0 16px 48px rgba(19, 78, 74, 0.14)',
      },
      transitionTimingFunction: {
        snap: 'cubic-bezier(0.23, 1, 0.32, 1)',
      },
      transitionDuration: {
        130: '130ms',
        170: '170ms',
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'fade-in': 'fadeIn 0.5s ease-out forwards',
        'slide-in': 'slideIn 0.5s ease-out forwards',
        'spin-slow': 'spin 3s linear infinite',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideIn: {
          '0%': { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
      backdropBlur: {
        xs: '2px',
      },
    },
  },
  plugins: [],
}
