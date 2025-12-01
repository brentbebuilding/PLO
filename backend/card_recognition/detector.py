"""
Card detection from poker screenshots using template matching and OCR.

This module handles detecting and recognizing playing cards from screenshots
of poker applications.
"""
from typing import List, Tuple, Optional, Dict
from dataclasses import dataclass
import cv2
import numpy as np
from PIL import Image
import io
import base64


@dataclass
class DetectedCard:
    """Represents a detected card from an image."""
    rank: str
    suit: str
    confidence: float
    bounding_box: Tuple[int, int, int, int]  # x, y, width, height

    def __str__(self) -> str:
        return f"{self.rank}{self.suit}"

    def to_dict(self) -> Dict:
        return {
            'rank': self.rank,
            'suit': self.suit,
            'card': str(self),
            'confidence': self.confidence,
            'bbox': self.bounding_box
        }


@dataclass
class PlayerCards:
    """Cards detected for a single player."""
    player_index: int
    cards: List[DetectedCard]
    region: Tuple[int, int, int, int]  # x, y, width, height


class CardDetector:
    """
    Detects playing cards from poker screenshots.

    Uses a combination of:
    1. Color detection for card regions
    2. Template matching for rank/suit recognition
    3. Contour analysis for card localization
    """

    # Standard card aspect ratio
    CARD_ASPECT_RATIO = 0.7  # width/height

    # Rank symbols
    RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A']

    # Suit symbols
    SUITS = ['c', 'd', 'h', 's']

    # Suit colors (for detection)
    SUIT_COLORS = {
        'c': 'black',   # clubs
        's': 'black',   # spades
        'd': 'red',     # diamonds
        'h': 'red'      # hearts
    }

    def __init__(self, template_dir: Optional[str] = None):
        """
        Initialize the card detector.

        Args:
            template_dir: Directory containing card template images
        """
        self.template_dir = template_dir
        self.rank_templates = {}
        self.suit_templates = {}
        self._load_templates()

    def _load_templates(self):
        """Load card rank and suit templates for matching."""
        # For now, we'll use generated templates
        # In production, these would be actual images
        pass

    def detect_from_image(
        self,
        image_data: bytes,
        num_players: int = 2,
        include_board: bool = True
    ) -> Dict:
        """
        Detect cards from a poker screenshot.

        Args:
            image_data: Raw image bytes (PNG/JPG)
            num_players: Expected number of players
            include_board: Whether to look for community cards

        Returns:
            Dictionary with detected cards for each player and board
        """
        # Convert bytes to OpenCV image
        nparr = np.frombuffer(image_data, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

        if img is None:
            raise ValueError("Could not decode image")

        # Find card regions
        card_regions = self._find_card_regions(img)

        # Extract cards from each region
        detected_cards = []
        for region in card_regions:
            x, y, w, h = region
            card_img = img[y:y+h, x:x+w]
            card = self._recognize_card(card_img, region)
            if card:
                detected_cards.append(card)

        # Group cards by player position
        result = self._group_cards_by_player(detected_cards, img.shape, num_players, include_board)

        return result

    def _find_card_regions(self, img: np.ndarray) -> List[Tuple[int, int, int, int]]:
        """
        Find rectangular regions that likely contain cards.

        Uses color thresholding and contour detection to find card-shaped
        white/cream rectangles.
        """
        # Convert to grayscale
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)

        # Threshold to find light-colored regions (cards are usually white/cream)
        _, thresh = cv2.threshold(gray, 200, 255, cv2.THRESH_BINARY)

        # Also try adaptive thresholding for varied lighting
        adaptive = cv2.adaptiveThreshold(
            gray, 255,
            cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
            cv2.THRESH_BINARY, 11, 2
        )

        # Combine thresholds
        combined = cv2.bitwise_or(thresh, adaptive)

        # Find contours
        contours, _ = cv2.findContours(
            combined,
            cv2.RETR_EXTERNAL,
            cv2.CHAIN_APPROX_SIMPLE
        )

        # Filter contours by shape (looking for rectangles with card aspect ratio)
        card_regions = []
        min_area = 500  # Minimum card area in pixels
        max_area = img.shape[0] * img.shape[1] * 0.1  # Max 10% of image

        for contour in contours:
            area = cv2.contourArea(contour)
            if area < min_area or area > max_area:
                continue

            # Approximate the contour to a polygon
            peri = cv2.arcLength(contour, True)
            approx = cv2.approxPolyDP(contour, 0.02 * peri, True)

            # Check if it's roughly rectangular (4 corners)
            if len(approx) >= 4 and len(approx) <= 8:
                x, y, w, h = cv2.boundingRect(contour)

                # Check aspect ratio (cards are taller than wide)
                aspect = w / h if h > 0 else 0
                if 0.5 <= aspect <= 0.9:  # Card-like aspect ratio
                    card_regions.append((x, y, w, h))

        # Sort by position (left to right, top to bottom)
        card_regions.sort(key=lambda r: (r[1] // 50, r[0]))

        return card_regions

    def _recognize_card(
        self,
        card_img: np.ndarray,
        bbox: Tuple[int, int, int, int]
    ) -> Optional[DetectedCard]:
        """
        Recognize the rank and suit of a card image.

        Uses color analysis and shape matching to identify the card.
        """
        if card_img.size == 0:
            return None

        # Get the corner region (where rank/suit are typically shown)
        h, w = card_img.shape[:2]
        corner = card_img[0:int(h*0.4), 0:int(w*0.5)]

        if corner.size == 0:
            return None

        # Detect suit by color
        suit = self._detect_suit_by_color(corner)

        # Detect rank using template matching or OCR
        rank = self._detect_rank(corner)

        if rank and suit:
            return DetectedCard(
                rank=rank,
                suit=suit,
                confidence=0.8,  # Placeholder confidence
                bounding_box=bbox
            )

        return None

    def _detect_suit_by_color(self, img: np.ndarray) -> Optional[str]:
        """Detect suit based on color (red vs black)."""
        # Convert to HSV
        hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)

        # Define red color range
        lower_red1 = np.array([0, 100, 100])
        upper_red1 = np.array([10, 255, 255])
        lower_red2 = np.array([160, 100, 100])
        upper_red2 = np.array([180, 255, 255])

        # Create masks
        mask_red1 = cv2.inRange(hsv, lower_red1, upper_red1)
        mask_red2 = cv2.inRange(hsv, lower_red2, upper_red2)
        red_mask = cv2.bitwise_or(mask_red1, mask_red2)

        # Count red pixels
        red_pixels = cv2.countNonZero(red_mask)
        total_pixels = img.shape[0] * img.shape[1]

        # If significant red, it's hearts or diamonds
        # We'll need shape analysis to distinguish between them
        if red_pixels > total_pixels * 0.05:
            # For now, default to hearts (more common in some games)
            # Shape analysis could distinguish hearts from diamonds
            return 'h'  # or 'd'
        else:
            # Black suit - clubs or spades
            return 's'  # or 'c'

    def _detect_rank(self, img: np.ndarray) -> Optional[str]:
        """Detect the card rank using template matching or feature detection."""
        # Convert to grayscale
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)

        # Threshold
        _, thresh = cv2.threshold(gray, 127, 255, cv2.THRESH_BINARY_INV)

        # Find contours of the rank symbol
        contours, _ = cv2.findContours(
            thresh,
            cv2.RETR_EXTERNAL,
            cv2.CHAIN_APPROX_SIMPLE
        )

        if not contours:
            return None

        # Find the largest contour (likely the rank)
        largest = max(contours, key=cv2.contourArea)
        area = cv2.contourArea(largest)

        if area < 50:
            return None

        # Get bounding box
        x, y, w, h = cv2.boundingRect(largest)

        # Analyze aspect ratio to distinguish between ranks
        # This is a simplified heuristic - real implementation would use
        # template matching or a trained classifier
        aspect = w / h if h > 0 else 0

        # Very rough heuristics based on character shapes
        # In production, use proper OCR or template matching
        if aspect > 1.2:
            return 'T'  # 10 is wider
        elif aspect < 0.4:
            return 'A'  # A tends to be narrow
        else:
            # Default - would need proper recognition
            return 'K'

        return None

    def _group_cards_by_player(
        self,
        cards: List[DetectedCard],
        img_shape: Tuple[int, int, int],
        num_players: int,
        include_board: bool
    ) -> Dict:
        """
        Group detected cards by player position.

        Uses spatial clustering based on card positions in the image.
        """
        h, w = img_shape[:2]

        # Define regions for different positions
        # This is a simplified layout - real poker tables vary
        regions = {
            'board': (w * 0.3, h * 0.35, w * 0.4, h * 0.2),  # Center
            'player1': (w * 0.1, h * 0.7, w * 0.3, h * 0.25),  # Bottom left
            'player2': (w * 0.6, h * 0.7, w * 0.3, h * 0.25),  # Bottom right
        }

        # Group cards by region
        result = {
            'players': [],
            'board': [],
            'unassigned': []
        }

        for card in cards:
            x, y, card_w, card_h = card.bounding_box
            center_x = x + card_w / 2
            center_y = y + card_h / 2

            assigned = False

            # Check if in board region
            if include_board:
                bx, by, bw, bh = regions['board']
                if bx <= center_x <= bx + bw and by <= center_y <= by + bh:
                    result['board'].append(card.to_dict())
                    assigned = True

            # Check player regions
            if not assigned:
                for i in range(1, num_players + 1):
                    region_key = f'player{i}'
                    if region_key in regions:
                        px, py, pw, ph = regions[region_key]
                        if px <= center_x <= px + pw and py <= center_y <= py + ph:
                            while len(result['players']) < i:
                                result['players'].append({'cards': []})
                            result['players'][i-1]['cards'].append(card.to_dict())
                            assigned = True
                            break

            if not assigned:
                result['unassigned'].append(card.to_dict())

        return result

    def detect_from_base64(
        self,
        base64_data: str,
        num_players: int = 2,
        include_board: bool = True
    ) -> Dict:
        """
        Detect cards from a base64-encoded image.

        Args:
            base64_data: Base64 encoded image string
            num_players: Expected number of players
            include_board: Whether to look for community cards

        Returns:
            Dictionary with detected cards
        """
        # Remove data URL prefix if present
        if ',' in base64_data:
            base64_data = base64_data.split(',')[1]

        # Decode base64
        image_data = base64.b64decode(base64_data)

        return self.detect_from_image(image_data, num_players, include_board)


def create_detector(template_dir: Optional[str] = None) -> CardDetector:
    """Factory function to create a card detector."""
    return CardDetector(template_dir)
