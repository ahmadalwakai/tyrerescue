import { createSystem, defaultConfig, defineConfig } from '@chakra-ui/react';
import { colorTokens as c } from './design-tokens';

const config = defineConfig({
  globalCss: {
    'input, textarea, select': {
      backgroundColor: `${c.input.bg} !important`,
      borderColor: `${c.input.border} !important`,
      color: `${c.input.text} !important`,
      borderRadius: '6px',
      fontSize: '15px',
    },
    'input::placeholder, textarea::placeholder': {
      color: `${c.input.placeholder} !important`,
    },
    'input:focus, textarea:focus, select:focus': {
      borderColor: `${c.input.borderFocus} !important`,
      boxShadow: `0 0 0 1px ${c.input.borderFocus} !important`,
      backgroundColor: `${c.input.bgFocus} !important`,
    },
    'input:hover, textarea:hover, select:hover': {
      borderColor: '#52525B !important',
    },
    'input:focus:hover, textarea:focus:hover, select:focus:hover': {
      borderColor: `${c.input.borderFocus} !important`,
    },
    'select option': {
      backgroundColor: `${c.select.option.bg} !important`,
      color: `${c.select.option.text} !important`,
    },
    'input[type="date"], input[type="time"], input[type="datetime-local"]': {
      colorScheme: 'dark',
    },
    'input[type="date"]::-webkit-calendar-picker-indicator, input[type="time"]::-webkit-calendar-picker-indicator, input[type="datetime-local"]::-webkit-calendar-picker-indicator': {
      filter: 'invert(1)',
    },
    'input[type="number"]::-webkit-inner-spin-button, input[type="number"]::-webkit-outer-spin-button': {
      filter: 'invert(0.8)',
    },
    // Checkbox styling
    '[data-checked] > span[data-part="control"]': {
      backgroundColor: `${c.accent} !important`,
      borderColor: `${c.accent} !important`,
    },
    // Field labels
    'label': {
      color: `${c.muted} !important`,
      fontSize: '13px',
    },
    // Table dark theme
    'table': {
      backgroundColor: `${c.card} !important`,
    },
    'thead': {
      backgroundColor: `${c.bg} !important`,
    },
    'th': {
      backgroundColor: `${c.bg} !important`,
      color: `${c.muted} !important`,
      borderColor: `${c.border} !important`,
    },
    'tr': {
      backgroundColor: `${c.card} !important`,
      borderColor: `${c.border} !important`,
    },
    'td': {
      backgroundColor: `${c.card} !important`,
      color: `${c.text} !important`,
      borderColor: `${c.border} !important`,
    },
  },
});

export const system = createSystem(defaultConfig, config);
