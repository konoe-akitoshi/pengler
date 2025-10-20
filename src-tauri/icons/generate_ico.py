#!/usr/bin/env python3
"""
Generate a minimal icon.ico file for Tauri Windows builds
ICO format contains multiple PNG images at different sizes
"""

from PIL import Image, ImageDraw

def create_icon():
    # Create a simple icon with multiple sizes (32x32, 64x64, 128x128, 256x256)
    sizes = [16, 32, 48, 64, 128, 256]
    images = []

    for size in sizes:
        # Create a new image with a blue background
        img = Image.new('RGBA', (size, size), (100, 150, 200, 255))
        draw = ImageDraw.Draw(img)

        # Draw a simple white circle/ellipse representing a photo/camera lens
        padding = size // 8
        draw.ellipse(
            [padding, padding, size - padding, size - padding],
            fill=(255, 255, 255, 255),
            outline=(255, 255, 255, 255)
        )

        # Draw an inner circle
        padding2 = size // 4
        draw.ellipse(
            [padding2, padding2, size - padding2, size - padding2],
            fill=(100, 150, 200, 255),
            outline=(100, 150, 200, 255)
        )

        images.append(img)

    # Save as ICO with multiple sizes
    images[0].save(
        'icon.ico',
        format='ICO',
        sizes=[(img.width, img.height) for img in images],
        append_images=images[1:]
    )
    print(f"✓ Created icon.ico with sizes: {sizes}")

if __name__ == '__main__':
    create_icon()
