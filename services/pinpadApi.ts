import axios from "axios";

const PINPAD_BASE_URL = "http://localhost:5000/api";

export async function criarPagamentoPinpad({
  valor,
  tipo,
  parcelas = 1,
}: {
  valor: number;
  tipo: "credito" | "debito";
  parcelas?: number;
}) {
  const resp = await axios.post(
    `${PINPAD_BASE_URL}/pagamento`,
    { valor, tipo, parcelas },
    { timeout: 60000 }
  );
  return resp.data;
}

export async function cancelarPagamentoPinpad({
  nsu,
  valor,
}: {
  nsu: string;
  valor: number;
}) {
  const resp = await axios.post(
    `${PINPAD_BASE_URL}/cancelar`,
    { nsu, valor },
    { timeout: 60000 }
  );
  return resp.data;
}

export async function statusPinpad() {
  const resp = await axios.get(`${PINPAD_BASE_URL}/status`, { timeout: 10000 });
  return resp.data;
}
