export const config = { runtime: "edge" };

const NOTION_TOKEN = process.env.NOTION_TOKEN;
const DB_ID = process.env.NOTION_DB_ID || "3b2d80b35c5380d98466d13673831fe8";

export default async function handler(req) {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      },
    });
  }

  const headers = {
    "Authorization": `Bearer ${NOTION_TOKEN}`,
    "Content-Type": "application/json",
    "Notion-Version": "2022-06-28",
  };

  const body = await req.json().catch(() => ({}));
  const { client, tracking, date, box_no, box_id, debug } = body;

  // Debug mode
  if (debug) {
    try {
      const res = await fetch(`https://api.notion.com/v1/databases/${DB_ID}`, {
        method: "GET",
        headers,
      });
      const data = await res.json();
      return new Response(JSON.stringify({
        db_id: DB_ID,
        token_prefix: NOTION_TOKEN.slice(0, 20) + "...",
        status: res.status,
        db_title: data.title?.[0]?.plain_text || "(no title)",
        properties: Object.keys(data.properties || {}),
        error: data.message || null,
      }), {
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      });
    } catch(e) {
      return new Response(JSON.stringify({ error: e.message }), {
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      });
    }
  }

  // Build filter - all rich_text except 回台日期
  const filters = [];
  if (client)   filters.push({ property: "客戶編號", rich_text: { contains: client } });
  if (tracking) filters.push({ property: "宅配編號", rich_text: { contains: tracking } });
  if (box_no)   filters.push({ property: "回台箱號", rich_text: { contains: box_no } });
  if (box_id)   filters.push({ property: "酒箱編號", rich_text: { equals: box_id } });
  if (date)     filters.push({ property: "回台日期", rich_text: { contains: date } });

  const query = {
    page_size: 100,
    sorts: [{ property: "客戶編號", direction: "ascending" }],
  };
  if (filters.length === 1) query.filter = filters[0];
  else if (filters.length > 1) query.filter = { and: filters };

  try {
    const res = await fetch(`https://api.notion.com/v1/databases/${DB_ID}/query`, {
      method: "POST",
      headers,
      body: JSON.stringify(query),
    });
    const data = await res.json();

    const rows = (data.results || []).map(page => {
      const p = page.properties;
      const getText = (key) => {
        if (!p[key]) return "";
        if (p[key].title)     return p[key].title?.[0]?.plain_text || "";
        if (p[key].rich_text) return p[key].rich_text?.[0]?.plain_text || "";
        if (p[key].number !== undefined) return p[key].number ?? "";
        if (p[key].date)      return p[key].date?.start || "";
        return "";
      };
      return {
        serial:    getText("流水號"),
        client:    getText("客戶編號"),
        box_id:    getText("酒箱編號"),
        tracking:  getText("宅配編號"),
        carrier:   getText("宅配業者"),
        qty:       getText("數量"),
        capacity:  getText("容量"),
        box_type:  getText("酒盒"),
        merchant:  getText("酒商"),
        label:     getText("酒標"),
        ship_box:  getText("回台箱號"),
        ship_date: getText("回台日期"),
      };
    });

    return new Response(JSON.stringify({ rows }), {
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    });
  }
}
