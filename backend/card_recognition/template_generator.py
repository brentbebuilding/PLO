"""
Generate card templates for template matching.

This module creates template images for each playing card that can be
used for template matching based card detection.
"""
from typing import Dict, Tuple
from PIL import Image, ImageDraw, ImageFont
import os


RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A']
SUITS = ['c', 'd', 'h', 's']

SUIT_SYMBOLS = {
    'c': '♣',
    'd': '♦',
    'h': '♥',
    's': '♠'
}

SUIT_COLORS = {
    'c': (0, 0, 0),       # Black
    's': (0, 0, 0),       # Black
    'd': (255, 0, 0),     # Red
    'h': (255, 0, 0)      # Red
}


def generate_card_image(
    rank: str,
    suit: str,
    width: int = 60,
    height: int = 85
) -> Image.Image:
    """
    Generate a simple card image.

    Args:
        rank: Card rank ('2'-'A')
        suit: Card suit ('c', 'd', 'h', 's')
        width: Card width in pixels
        height: Card height in pixels

    Returns:
        PIL Image of the card
    """
    # Create white background with rounded corners
    img = Image.new('RGB', (width, height), (255, 255, 255))
    draw = ImageDraw.Draw(img)

    # Add border
    draw.rectangle([0, 0, width-1, height-1], outline=(0, 0, 0), width=2)

    # Get suit symbol and color
    suit_symbol = SUIT_SYMBOLS.get(suit, suit)
    color = SUIT_COLORS.get(suit, (0, 0, 0))

    # Draw rank in top-left corner
    try:
        # Try to use a nice font
        font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 16)
        small_font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 12)
    except OSError:
        # Fall back to default font
        font = ImageFont.load_default()
        small_font = font

    # Rank text
    rank_text = '10' if rank == 'T' else rank
    draw.text((4, 2), rank_text, fill=color, font=font)

    # Suit symbol below rank
    draw.text((4, 20), suit_symbol, fill=color, font=small_font)

    # Large suit symbol in center
    try:
        center_font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 28)
    except OSError:
        center_font = font

    # Calculate center position
    bbox = draw.textbbox((0, 0), suit_symbol, font=center_font)
    text_width = bbox[2] - bbox[0]
    text_height = bbox[3] - bbox[1]
    x = (width - text_width) // 2
    y = (height - text_height) // 2

    draw.text((x, y), suit_symbol, fill=color, font=center_font)

    return img


def generate_card_templates(
    output_dir: str,
    width: int = 60,
    height: int = 85
) -> Dict[str, str]:
    """
    Generate template images for all 52 cards.

    Args:
        output_dir: Directory to save templates
        width: Card width
        height: Card height

    Returns:
        Dictionary mapping card codes to file paths
    """
    os.makedirs(output_dir, exist_ok=True)

    paths = {}
    for rank in RANKS:
        for suit in SUITS:
            card_code = f"{rank}{suit}"
            img = generate_card_image(rank, suit, width, height)

            filepath = os.path.join(output_dir, f"{card_code}.png")
            img.save(filepath)
            paths[card_code] = filepath

    return paths


def generate_rank_templates(
    output_dir: str,
    size: int = 30
) -> Dict[str, str]:
    """
    Generate templates for just the rank symbols.

    Args:
        output_dir: Directory to save templates
        size: Template size

    Returns:
        Dictionary mapping ranks to file paths
    """
    os.makedirs(output_dir, exist_ok=True)

    paths = {}
    for rank in RANKS:
        img = Image.new('L', (size, size), 255)  # Grayscale white background
        draw = ImageDraw.Draw(img)

        try:
            font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 20)
        except OSError:
            font = ImageFont.load_default()

        rank_text = '10' if rank == 'T' else rank
        bbox = draw.textbbox((0, 0), rank_text, font=font)
        text_width = bbox[2] - bbox[0]
        text_height = bbox[3] - bbox[1]
        x = (size - text_width) // 2
        y = (size - text_height) // 2

        draw.text((x, y), rank_text, fill=0, font=font)

        filepath = os.path.join(output_dir, f"rank_{rank}.png")
        img.save(filepath)
        paths[rank] = filepath

    return paths


def generate_suit_templates(
    output_dir: str,
    size: int = 30
) -> Dict[str, str]:
    """
    Generate templates for suit symbols.

    Args:
        output_dir: Directory to save templates
        size: Template size

    Returns:
        Dictionary mapping suits to file paths
    """
    os.makedirs(output_dir, exist_ok=True)

    paths = {}
    for suit in SUITS:
        # Generate grayscale version
        img = Image.new('L', (size, size), 255)
        draw = ImageDraw.Draw(img)

        try:
            font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 22)
        except OSError:
            font = ImageFont.load_default()

        symbol = SUIT_SYMBOLS[suit]
        bbox = draw.textbbox((0, 0), symbol, font=font)
        text_width = bbox[2] - bbox[0]
        text_height = bbox[3] - bbox[1]
        x = (size - text_width) // 2
        y = (size - text_height) // 2

        draw.text((x, y), symbol, fill=0, font=font)

        filepath = os.path.join(output_dir, f"suit_{suit}.png")
        img.save(filepath)
        paths[suit] = filepath

    return paths
