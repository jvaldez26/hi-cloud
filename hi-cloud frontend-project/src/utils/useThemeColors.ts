/**
 * Hook centralizado para colores conscientes del tema.
 * Todos los componentes deben usar este hook en lugar de colores hardcodeados.
 */
import { theme } from 'antd';

export function useThemeColors() {
  const { token } = theme.useToken();

  return {
    // ── Fondos ──────────────────────────────────────────────────────────────────
    bgPage:          token.colorBgLayout,
    bgCard:          token.colorBgContainer,
    bgElevated:      token.colorBgElevated,
    bgSpotlight:     token.colorFillAlter,
    bgInput:         token.colorBgContainer,
    bgHover:         token.colorFillSecondary,
    bgMask:          token.colorBgMask,

    // ── Texto ───────────────────────────────────────────────────────────────────
    text:            token.colorText,
    textSecondary:   token.colorTextSecondary,
    textTertiary:    token.colorTextTertiary,
    textDisabled:    token.colorTextDisabled,
    textInverse:     token.colorBgContainer, // texto sobre fondos de color

    // ── Bordes ──────────────────────────────────────────────────────────────────
    border:          token.colorBorder,
    borderLight:     token.colorBorderSecondary,
    borderSplit:     token.colorSplit,

    // ── Semánticos ───────────────────────────────────────────────────────────────
    primary:         token.colorPrimary,
    primaryBg:       token.colorPrimaryBg,
    primaryBorder:   token.colorPrimaryBorder,
    success:         token.colorSuccess,
    successBg:       token.colorSuccessBg,
    successBorder:   token.colorSuccessBorder,
    warning:         token.colorWarning,
    warningBg:       token.colorWarningBg,
    error:           token.colorError,
    errorBg:         token.colorErrorBg,
    errorBorder:     token.colorErrorBorder,
    info:            token.colorInfo,
    infoBg:          token.colorInfoBg,
    infoBorder:      token.colorInfoBorder,

    // ── Separadores ─────────────────────────────────────────────────────────────
    divider:         token.colorSplit,

    // ── Sombras ─────────────────────────────────────────────────────────────────
    shadow:          token.boxShadow,
    shadowCard:      token.boxShadow,
    shadowSecondary: token.boxShadowSecondary,

    // ── Acceso completo al token ─────────────────────────────────────────────────
    token,
  };
}

export type ThemeColors = ReturnType<typeof useThemeColors>;
