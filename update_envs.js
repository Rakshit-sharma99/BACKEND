const fs = require('fs');
const path = require('path');

const envDir = 'c:\\Users\\Ayush Singh\\Desktop\\Ayush\\Projects\\multiverse-test\\env';
const targetUri = 'mongodb+srv://macbeaseconnectionspvtltd_db_user:macbease2026pass@cluster0.ldffsk.mongodb.net/?appName=Cluster0';

const subdirs = fs.readdirSync(envDir);

subdirs.forEach(subdir => {
    const envPath = path.join(envDir, subdir, '.env');
    if (fs.existsSync(envPath)) {
        let content = fs.readFileSync(envPath, 'utf8');
        const lines = content.split('\n');
        
        // Find if MONGO_URI already exists (uncommented)
        let found = false;
        const newLines = lines.map(line => {
            if (line.startsWith('MONGO_URI=')) {
                found = true;
                return `MONGO_URI=${targetUri}`;
            }
            return line;
        });

        if (!found) {
            // Find a good place to insert it or just put it near the top
            // Put it after CLUSTER_URI if it exists, otherwise at the top
            const clusterIndex = newLines.findIndex(line => line.startsWith('CLUSTER_URI='));
            if (clusterIndex !== -1) {
                newLines.splice(clusterIndex + 1, 0, `MONGO_URI=${targetUri}`);
            } else {
                newLines.unshift(`MONGO_URI=${targetUri}`);
            }
        }

        fs.writeFileSync(envPath, newLines.join('\n'), 'utf8');
        console.log(`Updated ${envPath}`);
    }
});

console.log('Update complete.');
