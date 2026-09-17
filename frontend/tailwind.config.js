/**
 * Paleta de consola de operaciones.
 *
 * Regla del diseno: el color saturado esta reservado para la severidad.
 * Todo lo demas vive en la escala fria de grises azulados. Si un elemento
 * se pinta de rojo o de ambar es porque significa algo, nunca por adorno.
 */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        paper:  '#EEF1F5',
        panel:  '#FFFFFF',
        rule:   '#D3DAE3',
        ink:    '#16202C',
        'ink-2': '#5A6B7C',
        'ink-3': '#8A97A6',
        steel:  '#1F5F8B',
        'steel-dark': '#174A6D',
        'steel-soft': '#E3EDF4',
        sev: {
          low:      '#3E7CB1',
          medium:   '#B07D2B',
          high:     '#C2410C',
          critical: '#9B1C1C',
          ok:       '#2F7A55',
        },
      },
      fontFamily: {
        sans: ['"Source Sans 3"', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
      },
      fontSize: {
        micro: ['0.6875rem', { lineHeight: '1rem' }],
      },
      borderRadius: { panel: '3px' },
      boxShadow: {
        raise: '0 1px 2px rgba(22,32,44,0.08), 0 4px 12px rgba(22,32,44,0.06)',
      },
    },
  },
  plugins: [],
};
