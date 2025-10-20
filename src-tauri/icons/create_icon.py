#!/usr/bin/env python3
import struct
import zlib

def create_minimal_png(width, height, r, g, b, a=255):
    """Create a minimal valid PNG file"""
    
    def make_chunk(chunk_type, data):
        chunk = chunk_type + data
        crc = zlib.crc32(chunk) & 0xffffffff
        return struct.pack(">I", len(data)) + chunk + struct.pack(">I", crc)
    
    # PNG signature
    png = b'\x89PNG\r\n\x1a\n'
    
    # IHDR chunk
    ihdr = struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0)
    png += make_chunk(b'IHDR', ihdr)
    
    # IDAT chunk (image data)
    raw_data = b''
    for y in range(height):
        raw_data += b'\x00'  # Filter type
        for x in range(width):
            raw_data += bytes([r, g, b, a])
    
    compressed = zlib.compress(raw_data, 9)
    png += make_chunk(b'IDAT', compressed)
    
    # IEND chunk
    png += make_chunk(b'IEND', b'')
    
    return png

# Create a 512x512 blue icon
icon_data = create_minimal_png(512, 512, 100, 150, 200, 255)

with open('icon.png', 'wb') as f:
    f.write(icon_data)

print("Icon created successfully!")
