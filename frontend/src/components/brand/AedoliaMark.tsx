import React from 'react';

/**
 * Logo do Aedolia (livro aberto com ondas de som), em vetor: fica nítida em qualquer tamanho.
 * Usa a cor do texto (currentColor). O mesmo desenho está em public/aedolia-mark.svg.
 */
export const AedoliaMark: React.FC<{ size?: number; strokeWidth?: number; style?: React.CSSProperties }> = ({
  size = 24,
  strokeWidth = 3.4,
  style,
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 3.25 64 64"
    fill="none"
    stroke="currentColor"
    strokeWidth={strokeWidth}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    style={style}
  >
    <path d="M32 21C27 17.2 18.5 16.2 10.5 17.6V47.4C18.5 46 27 47 32 50.6" />
    <path d="M32 21C37 17.2 45.5 16.2 53.5 17.6V47.4C45.5 46 37 47 32 50.6" />
    <path d="M6 22V51.6C16 50 25.5 51 32 54.6C38.5 51 48 50 58 51.6V22" />
    <path d="M32 41.5V50.6" />
    <circle cx="32" cy="30.5" r="2.1" fill="currentColor" stroke="none" />
    <path d="M35.6 26.9A5.1 5.1 0 0 1 35.6 34.1" />
    <path d="M28.4 26.9A5.1 5.1 0 0 0 28.4 34.1" />
    <path d="M38.6 23.9A9.3 9.3 0 0 1 38.6 37.1" />
    <path d="M25.4 23.9A9.3 9.3 0 0 0 25.4 37.1" />
  </svg>
);
