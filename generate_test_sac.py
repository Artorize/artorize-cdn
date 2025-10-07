#!/usr/bin/env python3
"""
Generate a test SAC file for the Artorize CDN test suite
This creates a simple radial mask pattern for testing
"""

import struct
import numpy as np
from pathlib import Path

SAC_MAGIC = b"SAC1"
DTYPE_INT16 = 1


def to_c_contiguous_i16(x: np.ndarray) -> np.ndarray:
    """Ensure array is C-contiguous int16"""
    x = np.asarray(x, dtype=np.int16)
    if not x.flags['C_CONTIGUOUS']:
        x = np.ascontiguousarray(x)
    return x


def build_sac(a: np.ndarray, b: np.ndarray, width: int = 0, height: int = 0) -> bytes:
    """Build a SAC v1 binary file from two int16 arrays"""
    a = to_c_contiguous_i16(a)
    b = to_c_contiguous_i16(b)
    length_a = int(a.size)
    length_b = int(b.size)

    if width and height:
        assert length_a == width * height, "A length != width*height"
        assert length_b == width * height, "B length != width*height"

    header = struct.pack(
        '<4sBBBBIIII',
        SAC_MAGIC,      # 4s
        0,              # flags
        DTYPE_INT16,    # dtype_code
        2,              # arrays_count
        0,              # reserved
        length_a,       # uint32
        length_b,       # uint32
        width,          # uint32
        height          # uint32
    )
    return header + a.tobytes(order='C') + b.tobytes(order='C')


def generate_radial_mask(width: int, height: int, intensity: float = 1000.0) -> tuple[np.ndarray, np.ndarray]:
    """Generate a radial gradient mask pattern"""
    y, x = np.mgrid[0:height, 0:width]
    cx, cy = width / 2, height / 2
    dx = x - cx
    dy = y - cy
    dist = np.sqrt(dx * dx + dy * dy)
    max_dist = np.sqrt(cx * cx + cy * cy)

    # Radial pattern: strongest in center, fades to edges
    mask_intensity = ((1 - dist / max_dist) * intensity).astype(np.int16)

    # Array A and B have same pattern for simple test
    return mask_intensity, mask_intensity


def generate_checkerboard_mask(width: int, height: int, square_size: int = 50) -> tuple[np.ndarray, np.ndarray]:
    """Generate a checkerboard pattern mask"""
    y, x = np.mgrid[0:height, 0:width]
    checker = ((x // square_size + y // square_size) % 2 * 1000).astype(np.int16)
    return checker, checker


def generate_gradient_mask(width: int, height: int) -> tuple[np.ndarray, np.ndarray]:
    """Generate horizontal/vertical gradient masks"""
    y, x = np.mgrid[0:height, 0:width]

    # A: horizontal gradient
    a = ((x / width) * 2000 - 1000).astype(np.int16)

    # B: vertical gradient
    b = ((y / height) * 2000 - 1000).astype(np.int16)

    return a, b


def main():
    # Test dimensions
    width = 400
    height = 300

    print("Generating test SAC files...")

    # Create output directory
    output_dir = Path("test_data")
    output_dir.mkdir(exist_ok=True)

    # Generate different mask patterns
    patterns = {
        "radial": generate_radial_mask(width, height),
        "checkerboard": generate_checkerboard_mask(width, height),
        "gradient": generate_gradient_mask(width, height),
    }

    for name, (a, b) in patterns.items():
        sac_bytes = build_sac(a.ravel(), b.ravel(), width, height)
        output_path = output_dir / f"test_mask_{name}.sac"

        with open(output_path, 'wb') as f:
            f.write(sac_bytes)

        print(f"✓ Created {output_path} ({len(sac_bytes)} bytes, {width}x{height})")

    # Also generate a test image (simple gradient)
    print("\nGenerating test image...")
    try:
        from PIL import Image

        # Create RGB gradient test image
        img = np.zeros((height, width, 3), dtype=np.uint8)
        y, x = np.mgrid[0:height, 0:width]

        img[:, :, 0] = (x / width * 255).astype(np.uint8)  # R: horizontal gradient
        img[:, :, 1] = (y / height * 255).astype(np.uint8)  # G: vertical gradient
        img[:, :, 2] = ((x + y) / (width + height) * 255).astype(np.uint8)  # B: diagonal

        pil_img = Image.fromarray(img, 'RGB')
        img_path = output_dir / "test_image.png"
        pil_img.save(img_path)
        print(f"✓ Created {img_path} ({width}x{height})")

    except ImportError:
        print("⚠ PIL not available, skipping test image generation")
        print("  Install with: pip install Pillow")

    print("\nTest files ready in ./test_data/")
    print("Upload test_image.png and any test_mask_*.sac to the test page!")


if __name__ == "__main__":
    main()
