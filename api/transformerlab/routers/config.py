from fastapi import APIRouter

import transformerlab.db.db as db

router = APIRouter(prefix="/config", tags=["config"])


@router.get("/get/{key}", summary="")
async def config_get(key: str):
    value = await db.config_get(key=key)
    return value


@router.get("/set", summary="")
async def config_set(k: str, v: str):
    await db.config_set(key=k, value=v)
    return {"key": k, "value": v}
