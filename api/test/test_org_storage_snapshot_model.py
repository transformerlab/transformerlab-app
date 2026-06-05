from transformerlab.shared.models.models import OrgStorageSnapshot


def test_org_storage_snapshot_columns():
    cols = OrgStorageSnapshot.__table__.columns.keys()
    assert {"id", "team_id", "total_bytes", "breakdown_json", "per_user_json", "scanned_at"} <= set(cols)
    assert OrgStorageSnapshot.__tablename__ == "org_storage_snapshot"
    # No foreign keys (repo rule)
    assert all(len(c.foreign_keys) == 0 for c in OrgStorageSnapshot.__table__.columns)
