import XLSX from 'xlsx';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

// 1. Clean multi-sheet vendor workbook (Cookies)
function createCookiesMenu() {
  const wb = XLSX.utils.book_new();

  const flower = [
    ['Cookies Wholesale Menu - Flower', '', '', '', '', '', ''],
    ['SKU', 'Strain', 'Size', 'THC Range', 'Units/Case', 'Wholesale', 'MSRP'],
    ['CK-FL-CM-35', 'Cereal Milk', '3.5g', '28-32%', 24, 22.00, 55.00],
    ['CK-FL-CM-7', 'Cereal Milk', '7g', '28-32%', 12, 40.00, 95.00],
    ['CK-FL-GP-35', 'Gary Payton', '3.5g', '26-30%', 24, 22.00, 55.00],
    ['CK-FL-GP-7', 'Gary Payton', '7g', '26-30%', 12, 40.00, 95.00],
    ['CK-FL-CC-35', 'Collins Ave', '3.5g', '25-29%', 24, 20.00, 50.00],
    ['CK-FL-LS-35', 'London Pound Cake', '3.5g', '27-31%', 24, 22.00, 55.00],
    ['CK-FL-LS-7', 'London Pound Cake', '7g', '27-31%', 12, 40.00, 95.00],
    ['CK-FL-BC-35', 'Berry Pie', '3.5g', '24-28%', 24, 20.00, 50.00],
    ['CK-FL-GS-35', 'Georgia Pie', '3.5g', '26-30%', 24, 22.00, 55.00],
    ['CK-FL-CH-35', 'Cheetah Piss', '3.5g', '27-31%', 24, 22.00, 55.00],
  ];

  const prerolls = [
    ['Cookies Wholesale Menu - Pre-Rolls', '', '', '', '', '', ''],
    ['SKU', 'Product', 'Size', 'Pack Info', 'Units/Case', 'Wholesale', 'MSRP'],
    ['CK-PR-CM-1', 'Cereal Milk Single', '1g', '1pk', 50, 6.00, 15.00],
    ['CK-PR-GP-1', 'Gary Payton Single', '1g', '1pk', 50, 6.00, 15.00],
    ['CK-PR-MX-5', 'Mixed Pack Sativa', '2.5g', '5pk', 18, 22.00, 50.00],
    ['CK-PR-MX-5I', 'Mixed Pack Indica', '2.5g', '5pk', 18, 22.00, 50.00],
    ['CK-PR-INF-3', 'Infused - Cereal Milk', '3g', '3pk', 18, 28.00, 65.00],
    ['CK-PR-INF-3G', 'Infused - Gary Payton', '3g', '3pk', 18, 28.00, 65.00],
  ];

  const vapes = [
    ['Cookies Wholesale Menu - Vapes', '', '', '', '', '', ''],
    ['SKU', 'Product', 'Size', 'Type', 'Units/Case', 'Wholesale', 'MSRP'],
    ['CK-VP-CM-1', 'Cereal Milk Cart', '1g', 'Live Resin', 24, 26.00, 60.00],
    ['CK-VP-CM-05', 'Cereal Milk Cart', '0.5g', 'Live Resin', 24, 16.00, 35.00],
    ['CK-VP-GP-1', 'Gary Payton Cart', '1g', 'Live Resin', 24, 26.00, 60.00],
    ['CK-VP-LP-1', 'London Pound Cake Cart', '1g', 'Live Resin', 24, 26.00, 60.00],
    ['CK-VP-DS-1', 'Disposable - Cereal Milk', '1g', 'All-in-One', 24, 28.00, 65.00],
    ['CK-VP-DS-05', 'Disposable - Gary Payton', '0.5g', 'All-in-One', 24, 18.00, 40.00],
  ];

  const wsFlower = XLSX.utils.aoa_to_sheet(flower);
  const wsPrerolls = XLSX.utils.aoa_to_sheet(prerolls);
  const wsVapes = XLSX.utils.aoa_to_sheet(vapes);

  // Set column widths
  const colWidths = [{ wch: 16 }, { wch: 24 }, { wch: 8 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 10 }];
  wsFlower['!cols'] = colWidths;
  wsPrerolls['!cols'] = colWidths;
  wsVapes['!cols'] = colWidths;

  XLSX.utils.book_append_sheet(wb, wsFlower, 'Flower');
  XLSX.utils.book_append_sheet(wb, wsPrerolls, 'Pre-Rolls');
  XLSX.utils.book_append_sheet(wb, wsVapes, 'Vapes');

  XLSX.writeFile(wb, join(__dirname, '07-cookies-multi-sheet.xlsx'));
  console.log('Created 07-cookies-multi-sheet.xlsx');
}

// 2. Store-matrix format (the format buyers actually work in)
function createStoreMatrixMenu() {
  const wb = XLSX.utils.book_new();

  const data = [
    ['Kiva Confections - Store Order Form', '', '', '', '', '', '', '', '', '', '', '', '', ''],
    ['Rep: Sarah Kim | sarah@kivaconfections.com', '', '', '', '', '', '', '', '', '', '', '', '', ''],
    ['', '', '', '', '', '', '', '', '', '', '', '', '', ''],
    ['Product', 'SKU', 'Category', 'Size', 'Wholesale', 'Case Qty', 'Store 1\nDowntown', 'Store 2\nMidtown', 'Store 3\nWestside', 'Store 4\nEast Bay', 'Store 5\nNorth', 'Store 6\nSouth', 'Store 7\nBeach', 'TOTAL'],
    ['Camino Pineapple Habanero', 'KV-CAM-PH', 'Edible', '10pk 100mg', 10.00, 48, '', '', '', '', '', '', '', ''],
    ['Camino Watermelon Lemonade', 'KV-CAM-WL', 'Edible', '10pk 100mg', 10.00, 48, '', '', '', '', '', '', '', ''],
    ['Camino Midnight Blueberry', 'KV-CAM-MB', 'Edible', '10pk 100mg', 10.00, 48, '', '', '', '', '', '', '', ''],
    ['Camino Wild Berry', 'KV-CAM-WB', 'Edible', '10pk 100mg', 10.00, 48, '', '', '', '', '', '', '', ''],
    ['Camino Blood Orange', 'KV-CAM-BO', 'Edible', '10pk 100mg', 10.00, 48, '', '', '', '', '', '', '', ''],
    ['Camino Sparkling Pear 1:1', 'KV-CAM-SP', 'Edible', '10pk 100mg', 12.00, 48, '', '', '', '', '', '', '', ''],
    ['Camino Yuzu Lemon 5:1 CBG', 'KV-CAM-YL', 'Edible', '10pk 100mg', 12.00, 48, '', '', '', '', '', '', '', ''],
    ['Lost Farm Gummies - Strawnana', 'KV-LF-SN', 'Edible', '10pk 100mg', 12.00, 48, '', '', '', '', '', '', '', ''],
    ['Lost Farm Gummies - Blue Dream', 'KV-LF-BD', 'Edible', '10pk 100mg', 12.00, 48, '', '', '', '', '', '', '', ''],
    ['Lost Farm Chews - Watermelon', 'KV-LF-WM', 'Edible', '10pk 100mg', 12.00, 36, '', '', '', '', '', '', '', ''],
    ['Lost Farm Chews - Grape', 'KV-LF-GR', 'Edible', '10pk 100mg', 12.00, 36, '', '', '', '', '', '', '', ''],
    ['Kiva Bar - Dark Chocolate', 'KV-BAR-DC', 'Edible', '100mg bar', 8.00, 24, '', '', '', '', '', '', '', ''],
    ['Kiva Bar - Milk Chocolate', 'KV-BAR-MC', 'Edible', '100mg bar', 8.00, 24, '', '', '', '', '', '', '', ''],
    ['Kiva Bar - Espresso', 'KV-BAR-ES', 'Edible', '100mg bar', 8.00, 24, '', '', '', '', '', '', '', ''],
    ['Kiva Minis - Terra Blueberry', 'KV-MIN-TB', 'Edible', '20pk 100mg', 8.00, 48, '', '', '', '', '', '', '', ''],
    ['Kiva Minis - Terra Sea Salt', 'KV-MIN-SS', 'Edible', '20pk 100mg', 8.00, 48, '', '', '', '', '', '', '', ''],
    ['Petra Mints - Eucalyptus', 'KV-PET-EU', 'Edible', '40pk 100mg', 7.00, 48, '', '', '', '', '', '', '', ''],
    ['Petra Mints - Pineapple', 'KV-PET-PI', 'Edible', '40pk 100mg', 7.00, 48, '', '', '', '', '', '', '', ''],
  ];

  const ws = XLSX.utils.aoa_to_sheet(data);
  ws['!cols'] = [
    { wch: 32 }, { wch: 14 }, { wch: 10 }, { wch: 14 },
    { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 10 },
    { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 10 },
    { wch: 10 }, { wch: 8 },
  ];
  ws['!merges'] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: 13 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: 13 } },
  ];

  XLSX.utils.book_append_sheet(wb, ws, 'Order Form');
  XLSX.writeFile(wb, join(__dirname, '08-kiva-store-matrix.xlsx'));
  console.log('Created 08-kiva-store-matrix.xlsx');
}

// 3. Messy real-world format with merged cells, notes, and inconsistencies
function createMessyVendorMenu() {
  const wb = XLSX.utils.book_new();

  const data = [
    ['SELECT ELITE', '', '', '', '', ''],
    ['Updated 3/15/26 - prices subject to change', '', '', '', '', ''],
    ['', '', '', '', '', ''],
    ['', '', '', '', '', ''],
    ['--- CARTRIDGES ---', '', '', '', '', ''],
    ['Elite Live', 'Clementine', '.5g', 'Sativa', 18.00, '24/cs @ $410'],
    ['Elite Live', 'Jack Herer', '.5g', 'Sativa', 18.00, '24/cs @ $410'],
    ['Elite Live', 'Wedding Cake', '.5g', 'Hybrid', 18.00, '24/cs @ $410'],
    ['Elite Live', 'GMO Cookies', '.5g', 'Indica', 18.00, '24/cs @ $410'],
    ['Elite Live', 'Clementine', '1g', 'Sativa', 30.00, '24/cs @ $685'],
    ['Elite Live', 'Wedding Cake', '1g', 'Hybrid', 30.00, '24/cs @ $685'],
    ['Elite Live', 'GMO Cookies', '1g', 'Indica', 30.00, '24/cs @ $685'],
    ['Essentials', 'Blue Dream', '1g', 'Sativa', 18.00, '36/cs @ $612'],
    ['Essentials', 'GG#4', '1g', 'Hybrid', 18.00, '36/cs @ $612'],
    ['Essentials', 'Northern Lights', '1g', 'Indica', 18.00, '36/cs @ $612'],
    ['Essentials', 'GSC', '1g', 'Hybrid', 18.00, '36/cs @ $612'],
    ['', '', '', '', '', ''],
    ['--- DISPOSABLES ---', '', '', '', '', ''],
    ['Bite', 'Pineapple Express', '.3g', 'Sativa', 10.00, '48/cs @ $456'],
    ['Bite', 'Sunset Sherbet', '.3g', 'Hybrid', 10.00, '48/cs @ $456'],
    ['Bite', 'Purple Punch', '.3g', 'Indica', 10.00, '48/cs @ $456'],
    ['Bite', 'Watermelon Zkittlez', '.3g', 'Indica', 10.00, '48/cs @ $456'],
    ['', '', '', '', '', ''],
    ['Min order: $500 | Free shipping over $2000', '', '', '', '', ''],
    ['Terms: Net 15', '', '', '', '', ''],
  ];

  const ws = XLSX.utils.aoa_to_sheet(data);
  ws['!cols'] = [
    { wch: 18 }, { wch: 22 }, { wch: 8 }, { wch: 10 }, { wch: 12 }, { wch: 18 },
  ];

  XLSX.utils.book_append_sheet(wb, ws, 'Menu');
  XLSX.writeFile(wb, join(__dirname, '09-select-elite-messy.xlsx'));
  console.log('Created 09-select-elite-messy.xlsx');
}

// 4. Large vendor with tiered pricing
function createTieredPricingMenu() {
  const wb = XLSX.utils.book_new();

  const data = [
    ['Jeeter Wholesale Price List - California', '', '', '', '', '', '', ''],
    ['Effective: April 1, 2026', '', '', '', '', '', '', ''],
    ['', '', '', '', '', '', '', ''],
    ['SKU', 'Product', 'Category', 'Size', 'Case Qty', 'Tier 1 (1-5 cs)', 'Tier 2 (6-11 cs)', 'Tier 3 (12+ cs)'],
    ['JTR-PR-BDI', 'Baby Jeeter Infused - Blue ZKZ', 'Pre-Roll', '5pk 2.5g', 18, 24.00, 22.00, 20.00],
    ['JTR-PR-SFI', 'Baby Jeeter Infused - Strawberry', 'Pre-Roll', '5pk 2.5g', 18, 24.00, 22.00, 20.00],
    ['JTR-PR-GTI', 'Baby Jeeter Infused - Grape Ape', 'Pre-Roll', '5pk 2.5g', 18, 24.00, 22.00, 20.00],
    ['JTR-PR-WCI', 'Baby Jeeter Infused - Wedding Cake', 'Pre-Roll', '5pk 2.5g', 18, 24.00, 22.00, 20.00],
    ['JTR-PR-HCI', 'Baby Jeeter Infused - Horchata', 'Pre-Roll', '5pk 2.5g', 18, 24.00, 22.00, 20.00],
    ['JTR-PR-TPI', 'Baby Jeeter Infused - Tropicana', 'Pre-Roll', '5pk 2.5g', 18, 24.00, 22.00, 20.00],
    ['JTR-PR-BD', 'Baby Jeeter - Blue Dream', 'Pre-Roll', '5pk 2.5g', 18, 14.00, 13.00, 12.00],
    ['JTR-PR-SF', 'Baby Jeeter - SFV OG', 'Pre-Roll', '5pk 2.5g', 18, 14.00, 13.00, 12.00],
    ['JTR-PR-GA', 'Baby Jeeter - Grapefruit', 'Pre-Roll', '5pk 2.5g', 18, 14.00, 13.00, 12.00],
    ['JTR-XL-BZ', 'Jeeter XL Infused - Blue ZKZ', 'Pre-Roll', '2g single', 30, 12.00, 11.00, 10.00],
    ['JTR-XL-WC', 'Jeeter XL Infused - Wedding Cake', 'Pre-Roll', '2g single', 30, 12.00, 11.00, 10.00],
    ['JTR-XL-HC', 'Jeeter XL Infused - Horchata', 'Pre-Roll', '2g single', 30, 12.00, 11.00, 10.00],
    ['JTR-JC-BZ', 'Jeeter Juice Cart - Blue ZKZ', 'Vape', '1g', 24, 22.00, 20.00, 18.00],
    ['JTR-JC-SF', 'Jeeter Juice Cart - Strawberry', 'Vape', '1g', 24, 22.00, 20.00, 18.00],
    ['JTR-JC-GA', 'Jeeter Juice Cart - Grape Ape', 'Vape', '1g', 24, 22.00, 20.00, 18.00],
    ['JTR-JC-HC', 'Jeeter Juice Cart - Horchata', 'Vape', '1g', 24, 22.00, 20.00, 18.00],
    ['JTR-JC-WC', 'Jeeter Juice Cart - Wedding Cake', 'Vape', '1g', 24, 22.00, 20.00, 18.00],
    ['JTR-JD-BZ', 'Jeeter Juice Disposable - Blue ZKZ', 'Vape', '0.5g', 36, 14.00, 13.00, 12.00],
    ['JTR-JD-SF', 'Jeeter Juice Disposable - Strawberry', 'Vape', '0.5g', 36, 14.00, 13.00, 12.00],
    ['JTR-JD-GA', 'Jeeter Juice Disposable - Grape Ape', 'Vape', '0.5g', 36, 14.00, 13.00, 12.00],
  ];

  const ws = XLSX.utils.aoa_to_sheet(data);
  ws['!cols'] = [
    { wch: 14 }, { wch: 38 }, { wch: 10 }, { wch: 12 },
    { wch: 10 }, { wch: 16 }, { wch: 16 }, { wch: 16 },
  ];

  XLSX.utils.book_append_sheet(wb, ws, 'Price List');
  XLSX.writeFile(wb, join(__dirname, '10-jeeter-tiered-pricing.xlsx'));
  console.log('Created 10-jeeter-tiered-pricing.xlsx');
}

// Run all generators
createCookiesMenu();
createStoreMatrixMenu();
createMessyVendorMenu();
createTieredPricingMenu();
console.log('\nAll XLSX files created successfully!');
