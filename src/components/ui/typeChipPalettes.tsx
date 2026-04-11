import React from 'react';
import {
    Leaf, Flame, Candy, Droplets, Wind, Sparkles, FlaskConical, Package as PackageIcon,
    Scissors, Snowflake, Zap,
} from 'lucide-react';

export interface TypeChipStyle {
    bg: string;
    color: string;
    icon: React.ReactNode;
    label: string;
}

/** Palette: vendor product categories (ordering module). */
const PRODUCT_CATEGORY: Record<string, TypeChipStyle> = {
    flower:      { bg: '#E8F8EE', color: '#1A7A42', icon: <Leaf size={11} />,        label: 'Flower' },
    'pre-roll':  { bg: '#FFF3E8', color: '#B06A1F', icon: <Flame size={11} />,       label: 'Pre-Roll' },
    edible:      { bg: '#FCE8F0', color: '#A8305C', icon: <Candy size={11} />,       label: 'Edible' },
    concentrate: { bg: '#FEF3E2', color: '#8B5E14', icon: <Droplets size={11} />,    label: 'Concentrate' },
    vape:        { bg: '#E8F0FE', color: '#1B5EB5', icon: <Wind size={11} />,        label: 'Vape' },
    topical:     { bg: '#F0E8FE', color: '#6B3FA0', icon: <Sparkles size={11} />,    label: 'Topical' },
    tincture:    { bg: '#E8FEFA', color: '#167A6F', icon: <FlaskConical size={11} />, label: 'Tincture' },
    accessory:   { bg: '#F1F1F1', color: '#1A1A1A', icon: <PackageIcon size={11} />, label: 'Accessory' },
};

/** Palette: cannabis material / package types (packages, extraction, harvest). */
const PACKAGE_TYPE: Record<string, TypeChipStyle> = {
    flower:       { bg: '#E8F8EE', color: '#1A7A42', icon: <Leaf size={11} />,       label: 'Flower' },
    trim:         { bg: '#E8F0FE', color: '#1B5EB5', icon: <Scissors size={11} />,   label: 'Trim' },
    shake:        { bg: '#FFF3E8', color: '#B06A1F', icon: <Sparkles size={11} />,   label: 'Shake' },
    fresh_frozen: { bg: '#E8F4F8', color: '#0E6A8A', icon: <Snowflake size={11} />,  label: 'Fresh Frozen' },
    bubble_hash:  { bg: '#FEF3E2', color: '#8B5E14', icon: <Droplets size={11} />,   label: 'Bubble Hash' },
    rosin:        { bg: '#FFF8E7', color: '#9A7014', icon: <Flame size={11} />,      label: 'Rosin' },
    live_rosin:   { bg: '#FFF8E7', color: '#9A7014', icon: <Flame size={11} />,      label: 'Live Rosin' },
    live_resin:   { bg: '#E8FEFA', color: '#167A6F', icon: <Droplets size={11} />,   label: 'Live Resin' },
    distillate:   { bg: '#E8FEFA', color: '#167A6F', icon: <FlaskConical size={11} />, label: 'Distillate' },
    cart:         { bg: '#F0E8FE', color: '#6B3FA0', icon: <Wind size={11} />,       label: 'Cart' },
    vape:         { bg: '#F0E8FE', color: '#6B3FA0', icon: <Wind size={11} />,       label: 'Vape' },
    rosin_cart:   { bg: '#F0E8FE', color: '#6B3FA0', icon: <Zap size={11} />,        label: 'Rosin Cart' },
};

export const TYPE_CHIP_PALETTES = {
    productCategory: PRODUCT_CATEGORY,
    packageType: PACKAGE_TYPE,
} as const;

export type TypeChipPalette = keyof typeof TYPE_CHIP_PALETTES;

export const normalizeTypeChipKey = (v: string) =>
    v.toLowerCase().trim().replace(/\s+/g, '_');

export const getTypeChipStyle = (
    palette: TypeChipPalette,
    value: string,
): TypeChipStyle | undefined => TYPE_CHIP_PALETTES[palette][normalizeTypeChipKey(value)];
