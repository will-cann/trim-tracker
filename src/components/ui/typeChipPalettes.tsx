import React from 'react';
import {
    Leaf, Flame, Candy, Droplets, Wind, Sparkles, FlaskConical, Package as PackageIcon,
    Scissors, Snowflake, Zap,
    CalendarRange, Sprout, Send, Wind as HangingIcon, Boxes, CheckCircle2, Circle,
    Bug, Shield, Wrench, CloudSun, GraduationCap, SprayCan, Thermometer, Truck, Warehouse, ClipboardList,
    AlertTriangle, ArrowUp, Minus,
    Clock, XCircle,
} from 'lucide-react';

export interface TypeChipStyle {
    bg: string;
    color: string;
    icon: React.ReactNode;
    label: string;
}

// ── Brand tint pairs ─────────────────────────────────────────────────────────
// bg = light tint on white, color = darker brand variant for AA contrast at 11px.
// All derived from animal palette: Chameleon/Macaw/Lion/Cardinal/Rhino.
const TINT = {
    chameleon: { bg: '#E8F8EE', color: '#1A7A42' },
    macaw:     { bg: '#E8F0FE', color: '#1B5EB5' },
    lion:      { bg: '#FFF3E8', color: '#B06A1F' },
    cardinal:  { bg: '#FDECEC', color: '#A8403E' },
    rhino:     { bg: '#F1F1F1', color: '#5C5C5C' },
    panther:   { bg: '#F1F1F1', color: '#1A1A1A' },
} as const;

/** Palette: vendor product categories (ordering module). */
const PRODUCT_CATEGORY: Record<string, TypeChipStyle> = {
    flower:      { ...TINT.chameleon, icon: <Leaf size={11} />,        label: 'Flower' },
    'pre-roll':  { ...TINT.lion,      icon: <Flame size={11} />,       label: 'Pre-Roll' },
    edible:      { bg: '#FCE8F0', color: '#A8305C', icon: <Candy size={11} />, label: 'Edible' },
    concentrate: { bg: '#FEF3E2', color: '#8B5E14', icon: <Droplets size={11} />,    label: 'Concentrate' },
    vape:        { ...TINT.macaw,     icon: <Wind size={11} />,        label: 'Vape' },
    topical:     { bg: '#F0E8FE', color: '#6B3FA0', icon: <Sparkles size={11} />,    label: 'Topical' },
    tincture:    { bg: '#E8FEFA', color: '#167A6F', icon: <FlaskConical size={11} />, label: 'Tincture' },
    accessory:   { ...TINT.panther,   icon: <PackageIcon size={11} />, label: 'Accessory' },
};

/** Palette: cannabis material / package types (packages, extraction, harvest). */
const PACKAGE_TYPE: Record<string, TypeChipStyle> = {
    flower:       { ...TINT.chameleon, icon: <Leaf size={11} />,       label: 'Flower' },
    trim:         { ...TINT.macaw,     icon: <Scissors size={11} />,   label: 'Trim' },
    shake:        { ...TINT.lion,      icon: <Sparkles size={11} />,   label: 'Shake' },
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

/** Palette: harvest lifecycle stages. */
const HARVEST_STATUS: Record<string, TypeChipStyle> = {
    planning:  { ...TINT.macaw,     icon: <CalendarRange size={11} />, label: 'Planning' },
    cutting:   { ...TINT.chameleon, icon: <Scissors size={11} />,      label: 'Cutting' },
    active:    { ...TINT.chameleon, icon: <Sprout size={11} />,        label: 'Active' },
    submitted: { ...TINT.lion,      icon: <Send size={11} />,          label: 'Submitted' },
    hanging:   { ...TINT.lion,      icon: <HangingIcon size={11} />,   label: 'Hanging' },
    drying:    { ...TINT.lion,      icon: <HangingIcon size={11} />,   label: 'Drying' },
    bucking:   { ...TINT.chameleon, icon: <Boxes size={11} />,         label: 'Binning' },
    ready:     { ...TINT.chameleon, icon: <Boxes size={11} />,         label: 'Ready' },
    completed: { ...TINT.rhino,     icon: <CheckCircle2 size={11} />,  label: 'Completed' },
};

/** Palette: plant lifecycle phases. */
const PLANT_PHASE: Record<string, TypeChipStyle> = {
    nursery:    { ...TINT.macaw,     icon: <Sprout size={11} />,       label: 'Nursery' },
    vegetative: { ...TINT.chameleon, icon: <Leaf size={11} />,         label: 'Veg' },
    flowering:  { ...TINT.lion,      icon: <Flame size={11} />,        label: 'Flowering' },
    harvested:  { ...TINT.rhino,     icon: <CheckCircle2 size={11} />, label: 'Harvested' },
};

/** Palette: package lifecycle status. */
const PACKAGE_STATUS: Record<string, TypeChipStyle> = {
    active:   { ...TINT.chameleon, icon: <CheckCircle2 size={11} />, label: 'Active' },
    on_hold:  { ...TINT.lion,      icon: <Clock size={11} />,        label: 'On Hold' },
    finished: { ...TINT.rhino,     icon: <CheckCircle2 size={11} />, label: 'Finished' },
    archived: { ...TINT.rhino,     icon: <CheckCircle2 size={11} />, label: 'Archived' },
};

/** Palette: task categories. Collapsed to brand palette — icons disambiguate. */
const TASK_CATEGORY: Record<string, TypeChipStyle> = {
    drying_curing:  { ...TINT.lion,      icon: <Thermometer size={11} />,   label: 'Drying/Curing' },
    ipm:            { ...TINT.cardinal,  icon: <Bug size={11} />,           label: 'IPM' },
    compliance:     { ...TINT.macaw,     icon: <Shield size={11} />,        label: 'Compliance' },
    equipment:      { ...TINT.rhino,     icon: <Wrench size={11} />,        label: 'Equipment' },
    environmental:  { ...TINT.macaw,     icon: <CloudSun size={11} />,      label: 'Environmental' },
    packaging:      { ...TINT.chameleon, icon: <PackageIcon size={11} />,   label: 'Packaging' },
    qc_testing:     { ...TINT.macaw,     icon: <FlaskConical size={11} />,  label: 'QC/Testing' },
    inventory:      { ...TINT.lion,      icon: <Warehouse size={11} />,     label: 'Inventory' },
    transportation: { ...TINT.rhino,     icon: <Truck size={11} />,         label: 'Transport' },
    sanitation:     { ...TINT.macaw,     icon: <SprayCan size={11} />,      label: 'Sanitation' },
    training:       { ...TINT.rhino,     icon: <GraduationCap size={11} />, label: 'Training' },
    trim:           { ...TINT.chameleon, icon: <Scissors size={11} />,      label: 'Trim' },
    harvest:        { ...TINT.chameleon, icon: <Sprout size={11} />,        label: 'Harvest' },
    cultivation:    { ...TINT.chameleon, icon: <Leaf size={11} />,          label: 'Cultivation' },
    other:          { ...TINT.rhino,     icon: <ClipboardList size={11} />, label: 'Other' },
};

/** Palette: task priority. */
const TASK_PRIORITY: Record<string, TypeChipStyle> = {
    low:    { ...TINT.rhino,    icon: <Minus size={11} />,         label: 'Low' },
    medium: { ...TINT.macaw,    icon: <Circle size={11} />,        label: 'Medium' },
    high:   { ...TINT.lion,     icon: <ArrowUp size={11} />,       label: 'High' },
    urgent: { ...TINT.cardinal, icon: <AlertTriangle size={11} />, label: 'Urgent' },
};

/** Palette: harvest bin cure/trim states. */
const BIN_STATUS: Record<string, TypeChipStyle> = {
    curing:    { ...TINT.lion,      icon: <HangingIcon size={11} />,   label: 'Curing' },
    ready:     { ...TINT.chameleon, icon: <CheckCircle2 size={11} />,  label: 'Ready' },
    in_trim:   { ...TINT.macaw,     icon: <Scissors size={11} />,      label: 'In Trim' },
    completed: { ...TINT.rhino,     icon: <CheckCircle2 size={11} />,  label: 'Completed' },
};

/** Palette: lab testing state. */
const LAB_STATE: Record<string, TypeChipStyle> = {
    not_submitted: { ...TINT.rhino,    icon: <Circle size={11} />,        label: 'Not Sent' },
    submitted:     { ...TINT.macaw,    icon: <Send size={11} />,          label: 'Submitted' },
    passed:        { ...TINT.chameleon, icon: <CheckCircle2 size={11} />, label: 'Passed' },
    failed:        { ...TINT.cardinal, icon: <XCircle size={11} />,       label: 'Failed' },
};

export const TYPE_CHIP_PALETTES = {
    productCategory: PRODUCT_CATEGORY,
    packageType: PACKAGE_TYPE,
    harvestStatus: HARVEST_STATUS,
    plantPhase: PLANT_PHASE,
    packageStatus: PACKAGE_STATUS,
    taskCategory: TASK_CATEGORY,
    taskPriority: TASK_PRIORITY,
    binStatus: BIN_STATUS,
    labState: LAB_STATE,
} as const;

export type TypeChipPalette = keyof typeof TYPE_CHIP_PALETTES;

export const normalizeTypeChipKey = (v: string) =>
    v.toLowerCase().trim().replace(/\s+/g, '_');

export const getTypeChipStyle = (
    palette: TypeChipPalette,
    value: string,
): TypeChipStyle | undefined => TYPE_CHIP_PALETTES[palette][normalizeTypeChipKey(value)];
