const ftp = require('basic-ftp');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

async function debug() {
    const client = new ftp.Client();
    client.ftp.verbose = true;
    try {
        await client.access({
            host: process.env.FTP_HOST,
            user: process.env.FTP_USER,
            password: process.env.FTP_PASS,
            secure: false
        });

        console.log("\n--- FTP CONNECTED ---");
        const root = await client.pwd();
        console.log("Current working directory (Root):", root);

        console.log("\nListing Root contents:");
        const list = await client.list();
        for (const item of list) {
            console.log(`- [${item.type === 1 ? 'FILE' : 'DIR'}] ${item.name}`);
        }

        // Try to navigate to public_html/resultgen/uploads
        const dirs = ['public_html', 'resultgen', 'uploads'];
        let currentPath = "";
        
        for (const dir of dirs) {
            try {
                console.log(`\nAttempting to enter: ${dir}`);
                await client.cd(dir);
                currentPath = await client.pwd();
                console.log(`Successfully entered ${dir}. Current PWD: ${currentPath}`);
            } catch (err) {
                console.log(`Failed to enter ${dir}: ${err.message}`);
                console.log(`Attempting to CREATE ${dir}...`);
                await client.ensureDir(dir);
                console.log(`Created/Ensured ${dir}. Current PWD: ${await client.pwd()}`);
            }
        }

        console.log("\nFinal upload directory verified:", await client.pwd());
        
        // Try a tiny test upload
        const testFile = "test.txt";
        const { Readable } = require('stream');
        const s = new Readable();
        s.push("FTP Test Connection successful!");
        s.push(null);
        
        console.log(`\nAttempting test upload of ${testFile}...`);
        await client.uploadFrom(s, testFile);
        console.log("Test upload SUCCESSFUL!");

    } catch (err) {
        console.error("\n--- DEBUG FAILED ---");
        console.error(err);
    } finally {
        client.close();
    }
}

debug();
