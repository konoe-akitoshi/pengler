#!/usr/bin/env python3
"""
Generate a minimal icon.ico file using only standard library
This creates a very simple ICO file with a single 32x32 image
"""

import struct
import zlib

def create_minimal_png(width, height, r, g, b, a=255):
    """Create a minimal PNG image with solid color"""
    def png_chunk(chunk_type, data):
        chunk = chunk_type + data
        crc = zlib.crc32(chunk) & 0xffffffff
        return struct.pack('>I', len(data)) + chunk + struct.pack('>I', crc)

    # PNG header
    png_data = b'\x89PNG\r\n\x1a\n'

    # IHDR chunk (image header)
    ihdr = struct.pack('>IIBBBBB', width, height, 8, 6, 0, 0, 0)
    png_data += png_chunk(b'IHDR', ihdr)

    # IDAT chunk (image data) - solid color
    raw_data = b''
    for y in range(height):
        raw_data += b'\x00'  # filter type: None
        for x in range(width):
            raw_data += bytes([r, g, b, a])

    compressed = zlib.compress(raw_data, 9)
    png_data += png_chunk(b'IDAT', compressed)

    # IEND chunk (end)
    png_data += png_chunk(b'IEND', b'')

    return png_data

def create_ico_file():
    """Create an ICO file with embedded PNG images"""
    # Create PNG images at different sizes
    sizes = [(32, 32), (48, 48), (64, 64), (128, 128), (256, 256)]
    png_images = []

    for width, height in sizes:
        # Create a blue image (R=100, G=150, B=200)
        png_data = create_minimal_png(width, height, 100, 150, 200, 255)
        png_images.append((width, height, png_data))

    # ICO file header
    ico_data = struct.pack('<HHH', 0, 1, len(png_images))  # Reserved, Type (1=icon), Count

    # ICO directory entries
    offset = 6 + (16 * len(png_images))  # Header + all directory entries
    for width, height, png_data in png_images:
        # Width, Height, ColorCount, Reserved, Planes, BitCount, Size, Offset
        w = width if width < 256 else 0
        h = height if height < 256 else 0
        ico_data += struct.pack('<BBBBHHII', w, h, 0, 0, 1, 32, len(png_data), offset)
        offset += len(png_data)

    # Append all PNG images
    for _, _, png_data in png_images:
        ico_data += png_data

    # Write to file
    with open('icon.ico', 'wb') as f:
        f.write(ico_data)

    print(f"✓ Created icon.ico with {len(png_images)} sizes: {[s[0] for s in sizes]}")
    print(f"✓ Total file size: {len(ico_data)} bytes")

if __name__ == '__main__':
    create_ico_file()
