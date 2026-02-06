const fs = require('fs');
const path = require('path');

// Read version from package.json
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const version = pkg.version;

console.log(`Updating version to ${version}...`);

// Files to update
const updates = [
    {
        file: 'index.html',
        patterns: [
            { regex: /v=\d+\.\d+\.\d+/g, replacement: `v=${version}` },
            { regex: />v\d+\.\d+\.\d+</g, replacement: `>v${version}<` }
        ]
    },
    {
        file: 'sw.js',
        patterns: [
            { regex: /family-tracker-v\d+\.\d+\.\d+/g, replacement: `family-tracker-v${version}` },
            { regex: /v=\d+\.\d+\.\d+/g, replacement: `v=${version}` }
        ]
    }
];

// Apply updates
let totalChanges = 0;
updates.forEach(({ file, patterns }) => {
    const filePath = path.join(__dirname, file);

    if (!fs.existsSync(filePath)) {
        console.log(`⚠ File not found: ${file}`);
        return;
    }

    let content = fs.readFileSync(filePath, 'utf8');
    let changed = false;

    patterns.forEach(({ regex, replacement }) => {
        const matches = content.match(regex);
        if (matches) {
            content = content.replace(regex, replacement);
            changed = true;
            totalChanges += matches.length;
        }
    });

    if (changed) {
        fs.writeFileSync(filePath, content, 'utf8');
        console.log(`✓ Updated ${file}`);
    } else {
        console.log(`- No changes needed in ${file}`);
    }
});

console.log(`\nVersion update complete! (${totalChanges} replacements made)`);
