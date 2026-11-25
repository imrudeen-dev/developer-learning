import React from 'react';
import {
  Text as NativeText,
  TextInput as NativeTextInput,
  type TextInputProps,
  type TextProps,
} from 'react-native';
import { useAppPreferences } from '../lib/app-preferences';

type AppTextProps = TextProps & { className?: string };
type AppTextInputProps = TextInputProps & { className?: string };

const THEME_TEXT_CLASSES: Record<string, 'text' | 'muted'> = {
  'text-white': 'text',
  'text-gray-100': 'text',
  'text-gray-200': 'text',
  'text-gray-300': 'muted',
  'text-gray-400': 'muted',
  'text-gray-500': 'muted',
  'text-gray-600': 'muted',
};

function isTextSizeClass(token: string) {
  return (
    /^text-(xs|sm|base|lg|[2-9]xl)$/.test(token) ||
    /^text-\[\d+(?:\.\d+)?(?:px|rem|em)\]$/.test(token) ||
    ['text-left', 'text-center', 'text-right', 'text-justify'].includes(token)
  );
}

function resolveTextClassName(className: string | undefined, text: string, muted: string) {
  const tokens = className?.split(/\s+/).filter(Boolean) ?? [];
  const explicitColor = tokens.some(
    (token) => token.startsWith('text-') && !isTextSizeClass(token) && !(token in THEME_TEXT_CLASSES)
  );

  if (explicitColor) return { className, color: undefined };

  let color = text;
  const remaining = tokens.filter((token) => {
    const role = THEME_TEXT_CLASSES[token];
    if (!role) return true;
    color = role === 'text' ? text : muted;
    return false;
  });

  return { className: remaining.join(' '), color };
}

export function AppText({ className, style, ...props }: AppTextProps) {
  const { theme } = useAppPreferences();
  const resolved = resolveTextClassName(className, theme.text, theme.muted);

  return (
    <NativeText
      {...props}
      className={resolved.className}
      style={[resolved.color ? { color: resolved.color } : undefined, style]}
    />
  );
}

export function AppTextInput({
  className,
  style,
  placeholderTextColor,
  selectionColor,
  ...props
}: AppTextInputProps) {
  const { theme } = useAppPreferences();
  const resolved = resolveTextClassName(className, theme.text, theme.muted);

  return (
    <NativeTextInput
      {...props}
      className={resolved.className}
      placeholderTextColor={placeholderTextColor ?? theme.muted}
      selectionColor={selectionColor ?? theme.primary}
      style={[resolved.color ? { color: resolved.color } : undefined, style]}
    />
  );
}
