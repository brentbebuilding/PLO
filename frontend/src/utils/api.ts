import axios from 'axios';
import { Card, EquityResponse, CardDetectionResponse } from '../types';
import { cardToString } from './cards';

const API_BASE = '/api';

export async function calculateEquity(
  players: Card[][],
  board: Card[]
): Promise<EquityResponse> {
  const response = await axios.post<EquityResponse>(`${API_BASE}/equity`, {
    players: players.map((hand) => ({
      cards: hand.map(cardToString),
    })),
    board: board.map(cardToString),
    simulations: 10000,
  });
  return response.data;
}

export async function detectCardsFromImage(
  imageBase64: string,
  numPlayers: number = 2
): Promise<CardDetectionResponse> {
  const response = await axios.post<CardDetectionResponse>(
    `${API_BASE}/detect-cards`,
    {
      image: imageBase64,
      num_players: numPlayers,
      include_board: true,
    }
  );
  return response.data;
}

export async function uploadScreenshot(
  file: File,
  numPlayers: number = 2
): Promise<CardDetectionResponse> {
  const formData = new FormData();
  formData.append('file', file);

  const response = await axios.post<CardDetectionResponse>(
    `${API_BASE}/detect-cards/upload?num_players=${numPlayers}&include_board=true`,
    formData,
    {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    }
  );
  return response.data;
}
