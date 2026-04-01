"""Unit tests for team job/task visibility helpers."""

from transformerlab.services.members_visibility_service import viewer_may_see_job, viewer_may_see_task
from transformerlab.shared.models.models import TeamRole


class _User:
    def __init__(self, uid: str, email: str):
        self.id = uid
        self.email = email


def test_viewer_may_see_job_all_mode():
    u = _User("u1", "a@x.com")
    job = {"job_data": {"created_by_user_id": "other"}}
    assert viewer_may_see_job(job=job, viewer_user=u, role=TeamRole.MEMBER.value, visibility="all") is True


def test_viewer_may_see_job_owner_always():
    u = _User("u1", "a@x.com")
    job = {"job_data": {"created_by_user_id": "other"}}
    assert viewer_may_see_job(job=job, viewer_user=u, role=TeamRole.OWNER.value, visibility="own") is True


def test_viewer_may_see_job_member_own_by_id():
    u = _User("u1", "a@x.com")
    job = {"job_data": {"created_by_user_id": "u1"}}
    assert viewer_may_see_job(job=job, viewer_user=u, role=TeamRole.MEMBER.value, visibility="own") is True


def test_viewer_may_see_job_member_own_by_email_fallback():
    u = _User("u1", "a@x.com")
    job = {"job_data": {"user_info": {"email": "a@x.com"}}}
    assert viewer_may_see_job(job=job, viewer_user=u, role=TeamRole.MEMBER.value, visibility="own") is True


def test_viewer_may_see_job_member_own_denied():
    u = _User("u1", "a@x.com")
    job = {"job_data": {"created_by_user_id": "other", "user_info": {"email": "b@x.com"}}}
    assert viewer_may_see_job(job=job, viewer_user=u, role=TeamRole.MEMBER.value, visibility="own") is False


def test_viewer_may_see_task_missing_creator():
    u = _User("u1", "a@x.com")
    task = {"name": "t"}
    assert viewer_may_see_task(task=task, viewer_user=u, role=TeamRole.MEMBER.value, visibility="own") is False


def test_viewer_may_see_task_member_own():
    u = _User("u1", "a@x.com")
    task = {"created_by_user_id": "u1"}
    assert viewer_may_see_task(task=task, viewer_user=u, role=TeamRole.MEMBER.value, visibility="own") is True


def test_viewer_may_see_task_owner():
    u = _User("u1", "a@x.com")
    task = {"created_by_user_id": "other"}
    assert viewer_may_see_task(task=task, viewer_user=u, role=TeamRole.OWNER.value, visibility="own") is True
