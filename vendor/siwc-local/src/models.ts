import { apiError, ChatGPTError, fetchRemote, isObject, jsonResponse } from "./errors.js";
import type { ChatGPTModel } from "./types.js";

export async function listModels(accessToken: string, signal: AbortSignal): Promise<ChatGPTModel[]> {
  const response = await fetchRemote("https://api.openai.com/v1/models", {
    headers: { authorization: `Bearer ${accessToken}`, accept: "application/json" },
    signal,
  });
  const body = await jsonResponse(response);
  if (!response.ok) throw apiError(body, response.status, response.headers.get("x-request-id"));
  if (!isObject(body) || !Array.isArray(body.models)) {
    throw new ChatGPTError("invalid_model_catalog", "ChatGPT returned an unexpected model catalog. Try again.", true, response.status);
  }
  const result: ChatGPTModel[] = [];
  for (const model of body.models) {
    if (!isObject(model) || model.visibility !== "list") continue;
    if (typeof model.slug !== "string" || !model.slug.trim() || model.slug.length > 200 ||
        typeof model.display_name !== "string" || !model.display_name.trim() || model.display_name.length > 200) {
      throw new ChatGPTError("invalid_model_catalog", "ChatGPT returned an incomplete model listing. Try again.", true, response.status);
    }
    const supportedEfforts = Array.isArray(model.supported_reasoning_levels)
      ? model.supported_reasoning_levels.filter(isObject).map(level => level.effort).filter((effort): effort is string => typeof effort === 'string' && /^[a-z]+$/.test(effort))
      : [];
    result.push({ slug: model.slug, displayName: model.display_name, supportedEfforts,
      ...(typeof model.default_reasoning_level === 'string' ? {defaultEffort: model.default_reasoning_level} : {}) });
  }
  return result;
}
