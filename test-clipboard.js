#!/usr/bin/env node

/**
 * Clipboard Test Script
 * 
 * This script tests various clipboard scenarios in the browser console.
 * Copy this code and paste it into the browser console to test clipboard functionality.
 */

console.log('=== Clipboard Functionality Test ===');

// Test 1: Check basic clipboard API availability
console.log('\n1. Checking Clipboard API availability:');
console.log('   navigator.clipboard:', !!navigator.clipboard);
console.log('   navigator.clipboard.read:', !!navigator.clipboard?.read);
console.log('   navigator.clipboard.readText:', !!navigator.clipboard?.readText);
console.log('   navigator.clipboard.write:', !!navigator.clipboard?.write);

// Test 2: Check permissions
console.log('\n2. Checking permissions:');
if (navigator.permissions) {
    navigator.permissions.query({ name: 'clipboard-read' })
        .then(result => console.log('   Clipboard read permission:', result.state))
        .catch(err => console.log('   Clipboard read permission check failed:', err.message));
    
    navigator.permissions.query({ name: 'clipboard-write' })
        .then(result => console.log('   Clipboard write permission:', result.state))
        .catch(err => console.log('   Clipboard write permission check failed:', err.message));
} else {
    console.log('   Permissions API not available');
}

// Test 3: Protocol and security context
console.log('\n3. Security context:');
console.log('   Protocol:', window.location.protocol);
console.log('   Secure context:', window.isSecureContext);
console.log('   Origin:', window.location.origin);

// Test 4: Create a paste event listener
console.log('\n4. Setting up paste event listener...');
const testPasteHandler = (e) => {
    console.log('\n=== PASTE EVENT TRIGGERED ===');
    console.log('Event:', e);
    console.log('ClipboardData:', e.clipboardData);
    
    if (e.clipboardData && e.clipboardData.items) {
        console.log('Items found:', e.clipboardData.items.length);
        
        for (let i = 0; i < e.clipboardData.items.length; i++) {
            const item = e.clipboardData.items[i];
            console.log(`Item ${i}:`, {
                type: item.type,
                kind: item.kind
            });
            
            if (item.kind === 'file') {
                const file = item.getAsFile();
                if (file) {
                    console.log('File details:', {
                        name: file.name,
                        type: file.type,
                        size: file.size,
                        lastModified: new Date(file.lastModified)
                    });
                }
            }
        }
    }
};

document.addEventListener('paste', testPasteHandler);
console.log('   Paste listener attached. Try pasting now!');

// Test 5: Try to read clipboard (requires user interaction)
console.log('\n5. Clipboard read test:');
console.log('   Run testClipboard() after copying an image to test reading');

window.testClipboard = async () => {
    try {
        const items = await navigator.clipboard.read();
        console.log('Successfully read clipboard:', items.length, 'items');
        
        for (const item of items) {
            console.log('Item types:', item.types);
            
            for (const type of item.types) {
                if (type.startsWith('image/')) {
                    const blob = await item.getType(type);
                    console.log('Image found!', {
                        type: blob.type,
                        size: blob.size
                    });
                }
            }
        }
    } catch (err) {
        console.error('Failed to read clipboard:', err);
    }
};

// Cleanup function
window.cleanupClipboardTest = () => {
    document.removeEventListener('paste', testPasteHandler);
    console.log('Paste listener removed');
};

console.log('\n=== Test setup complete ===');
console.log('Instructions:');
console.log('1. Copy an image from any application');
console.log('2. Click anywhere on the page and press Ctrl+V');
console.log('3. Check the console output');
console.log('4. Run testClipboard() to test direct clipboard reading');
console.log('5. Run cleanupClipboardTest() when done');