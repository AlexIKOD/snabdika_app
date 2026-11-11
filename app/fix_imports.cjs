const fs = require('fs');
const path = require('path');

function walk(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach(file => {
    file = path.join(dir, file);
    const stat = fs.statSync(file);
    if (stat && stat.isDirectory()) { 
      results = results.concat(walk(file));
    } else { 
      if (file.endsWith('.tsx') || file.endsWith('.ts')) {
        results.push(file);
      }
    }
  });
  return results;
}

const files = walk('./src');
files.forEach(file => {
  let content = fs.readFileSync(file, 'utf8');
  let original = content;
  
  content = content.replace(/\bRefresh\b(?!Cw)/g, 'RefreshCw');
  content = content.replace(/\bBuildingWarehouse\b/g, 'Warehouse');
  content = content.replace(/\bFilterOff\b/g, 'FilterX');
  content = content.replace(/\bRobot\b/g, 'Bot');
  content = content.replace(/\bChecklist\b/g, 'ListChecks');
  content = content.replace(/\bDeviceFloppy\b/g, 'Save');
  content = content.replace(/\bAdjustments\b/g, 'SlidersHorizontal');
  content = content.replace(/variant="default"/g, 'variant="neutral"');
  content = content.replace(/variant='default'/g, "variant='neutral'");
  
  if (original !== content) {
    fs.writeFileSync(file, content, 'utf8');
    console.log('Fixed imports in', file);
  }
});
