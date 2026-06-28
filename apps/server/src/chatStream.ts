import OpenAI from "openai";

type Emit = (event: object) => void;

interface ToolCall {
  call_id: string;
  name: string;
  arguments: string;
}

const client = new OpenAI();

// --- Weather ---------------------------------------------------------------

const WMO_CONDITIONS: Record<number, string> = {
  0: "Clear sky",
  1: "Mainly clear",
  2: "Partly cloudy",
  3: "Overcast",
  45: "Fog",
  48: "Icy fog",
  51: "Light drizzle",
  53: "Drizzle",
  55: "Heavy drizzle",
  61: "Light rain",
  63: "Rain",
  65: "Heavy rain",
  71: "Light snow",
  73: "Snow",
  75: "Heavy snow",
  80: "Rain showers",
  81: "Showers",
  82: "Heavy showers",
  95: "Thunderstorm",
  96: "Thunderstorm with hail",
  99: "Severe thunderstorm",
};

async function getWeather({ city }: { city: string }) {
  const { results } = await fetch(
    `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1`,
  ).then((r) => r.json());

  const location = results?.[0];
  if (!location) throw new Error(`City not found: ${city}`);

  const { current } = await fetch(
    `https://api.open-meteo.com/v1/forecast?latitude=${location.latitude}&longitude=${location.longitude}&current=temperature_2m,weather_code,wind_speed_10m`,
  ).then((r) => r.json());

  return {
    city: location.name,
    temperature: Math.round(current.temperature_2m),
    condition: WMO_CONDITIONS[current.weather_code] ?? "Unknown",
    windSpeed: Math.round(current.wind_speed_10m),
  };
}

// --- Tools -----------------------------------------------------------------

const weatherTool: OpenAI.Responses.Tool = {
  type: "function",
  name: "get_weather",
  description: "Get the current weather for a city",
  strict: false,
  parameters: {
    type: "object",
    properties: { city: { type: "string", description: "City name" } },
    required: ["city"],
  },
};

const tools: OpenAI.Responses.Tool[] = [
  ...(process.env.OPENAI_VECTOR_STORE_ID
    ? [{ type: "file_search" as const, vector_store_ids: [process.env.OPENAI_VECTOR_STORE_ID] }]
    : []),
  weatherTool,
];

// --- Streaming -------------------------------------------------------------

async function ask(message: string, previousResponseId: string | null) {
  return client.responses.create({
    model: "gpt-4o-mini",
    input: message,
    instructions:
      "When asked about current weather, always call the get_weather tool. Never guess or invent weather data.",
    tools,
    previous_response_id: previousResponseId,
    stream: true,
  });
}

async function processResponse(
  stream: AsyncIterable<OpenAI.Responses.ResponseStreamEvent>,
  emit: Emit,
): Promise<{ responseId: string; toolCall: ToolCall | null }> {
  let responseId = "";
  let toolCall: ToolCall | null = null;

  for await (const event of stream) {
    if (event.type === "response.output_text.delta" && event.delta) {
      emit({ type: "text", data: event.delta });
    } else if (
      event.type === "response.output_item.done" &&
      event.item.type === "function_call"
    ) {
      toolCall = {
        call_id: event.item.call_id,
        name: event.item.name,
        arguments: event.item.arguments,
      };
    } else if (event.type === "response.completed") {
      responseId = event.response.id;
    }
  }

  return { responseId, toolCall };
}

async function handleWeatherCall(
  toolCall: ToolCall,
  previousResponseId: string,
  emit: Emit,
): Promise<string> {
  const weather = await getWeather(JSON.parse(toolCall.arguments));
  emit({ type: "weather", data: weather });

  const followUp = await client.responses.create({
    model: "gpt-4o-mini",
    previous_response_id: previousResponseId,
    input: [
      {
        type: "function_call_output",
        call_id: toolCall.call_id,
        output: JSON.stringify(weather),
      },
    ],
    tools,
    stream: true,
  });

  const { responseId } = await processResponse(followUp, emit);
  return responseId;
}

export async function streamChat(
  message: string,
  previousResponseId: string | null,
  emit: Emit,
) {
  const { responseId, toolCall } = await processResponse(
    await ask(message, previousResponseId),
    emit,
  );

  const finalResponseId =
    toolCall?.name === "get_weather"
      ? await handleWeatherCall(toolCall, responseId, emit)
      : responseId;

  emit({ type: "done", responseId: finalResponseId });
}
