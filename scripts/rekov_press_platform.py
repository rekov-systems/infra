"""Idempotent foundation for a Rekov self-hosted Press control plane.

Run with ``bench --site <control-site> execute press.rekov_press_platform.bootstrap``.
Configuration is passed through environment variables by deploy.sh; tenant
domains and public IPs are never hard-coded in this module.
"""

from __future__ import annotations

import os
from datetime import timedelta

import frappe
from frappe.utils import now_datetime
from press.runner import Ansible as PressAnsible


def required(name: str) -> str:
    value = os.environ.get(name, "").strip()
    if not value:
        frappe.throw(f"Missing required Press platform configuration: {name}")
    return value


def ensure_doc(doctype: str, name: str, values: dict) -> str:
    if frappe.db.exists(doctype, name):
        doc = frappe.get_doc(doctype, name)
        changed = False
        for field, value in values.items():
            if value is not None and doc.get(field) != value:
                doc.set(field, value)
                changed = True
        if changed:
            doc.save(ignore_permissions=True)
        return doc.name

    doc = frappe.get_doc({"doctype": doctype, "name": name, **values})
    # A previous bootstrap may have committed this row while the surrounding
    # operation was interrupted. Frappe's native duplicate handling lets us
    # continue without relying on an exception alias that varies by release.
    doc.insert(ignore_permissions=True, ignore_if_duplicate=True)
    existing_name = frappe.db.get_value(doctype, {"name": name}, "name")
    if not existing_name:
        return doc.name

    doc = frappe.get_doc(doctype, existing_name)
    changed = False
    for field, value in values.items():
        if value is not None and doc.get(field) != value:
            doc.set(field, value)
            changed = True
    if changed:
        doc.save(ignore_permissions=True)
    return doc.name


def ensure_operator_team() -> str:
    team = frappe.db.get_value("Team", {"user": "Administrator"}, "name")
    if team:
        doc = frappe.get_doc("Team", team)
        updates = {
            "enabled": 1,
            "free_account": 1,
            "self_hosted_servers_enabled": 1,
            "servers_enabled": 1,
            "benches_enabled": 1,
        }
        for field, value in updates.items():
            doc.set(field, value)
        doc.save(ignore_permissions=True)
        return doc.name

    doc = frappe.get_doc(
        {
            "doctype": "Team",
            "team_title": "Rekov Operations",
            "user": "Administrator",
            "country": "Colombia",
            "enabled": 1,
            "free_account": 1,
            "self_hosted_servers_enabled": 1,
            "servers_enabled": 1,
            "benches_enabled": 1,
            "team_members": [{"user": "Administrator"}],
        }
    )
    doc.insert(ignore_permissions=True)
    return doc.name


def ensure_self_hosted_server(cluster: str, team: str, plan: str, proxy: str) -> str:
    """Register the Contabo node and make Press able to manage it.

    The UI creates a random SHS name, so lookup by IP/title is important for
    recovery after an interrupted setup or a manually-created first record.
    """
    ip = required("PRESS_TENANT_NODE_PUBLIC_IP")
    db_password = required("PRESS_DB_ROOT_PASSWORD")
    existing = frappe.db.get_value(
        "Self Hosted Server",
        {"ip": ip},
        "name",
        order_by="creation asc",
    )
    values = {
        "title": "Rekov ERPNext",
        "ip": ip,
        "private_ip": ip,
        "mariadb_ip": ip,
        "mariadb_private_ip": ip,
        "ssh_user": "ubuntu",
        "ssh_port": 22,
        "team": team,
        "cluster": cluster,
        "plan": plan,
        "database_plan": plan,
        "proxy_server": proxy,
        "proxy_created": 1,
        # Press keeps a Database Server record even when MariaDB shares the
        # application VM. False makes the database setup job trigger the app
        # setup on the same host instead of treating it as a second machine.
        "different_database_server": 0,
        "new_server": 1,
        "server_created": 1 if existing else 0,
        "database_setup": 1 if existing else 0,
        "mariadb_root_password": db_password,
    }
    if existing:
        doc = frappe.get_doc("Self Hosted Server", existing)
        values["server_created"] = 1 if doc.server else 0
        values["database_setup"] = 1 if doc.database_server else 0
        for field, value in values.items():
            if field not in {"mariadb_root_password"} and value is not None:
                doc.set(field, value)
        doc.mariadb_root_password = db_password
        doc.save(ignore_permissions=True)
        return doc.name

    doc = frappe.get_doc({"doctype": "Self Hosted Server", **values})
    doc.insert(ignore_permissions=True)
    return doc.name


def ensure_frappe_version() -> str:
    return ensure_doc(
        "Frappe Version",
        "Version 16",
        {"number": 16, "status": "Stable", "public": 1, "default": 1},
    )


def ensure_app_source(app_name: str, title: str, repository: str, version: str, team: str) -> str:
    app = ensure_doc(
        "App",
        app_name,
        {"title": title, "team": team, "public": 1, "enabled": 1, "skip_review": 1},
    )
    app_doc = frappe.get_doc("App", app)
    source = app_doc.add_source(repository, "version-16", version, team=team, public=True)
    release_name = frappe.db.get_value(
        "App Release", {"source": source.name}, "name", order_by="creation desc"
    )
    if not release_name:
        release_name = source.create_release(force=True)
    if release_name:
        frappe.db.set_value(
            "App Release",
            release_name,
            {"status": "Approved", "public": 1, "deployable": 1},
            update_modified=False,
        )
    return source.name


def ensure_release_pipeline(team: str, version: str, server_name: str) -> str | None:
    """Reconcile the native Press release/deploy/bench pipeline.

    A Bench is not a standalone record in Press. It is created by a Deploy
    after a Deploy Candidate Build succeeds. The old implementation treated
    any existing Bench or Deploy Candidate as completion, which left the
    self-hosted server visibly stuck in Pending after an interrupted or
    failed first build.
    """
    server = frappe.get_doc("Self Hosted Server", server_name)
    if not server.server:
        return None
    app_server = frappe.get_doc("Server", server.server)
    if app_server.status != "Active":
        return None

    frappe_source = ensure_app_source(
        "frappe", "Frappe", "https://github.com/frappe/frappe", version, team
    )
    erpnext_source = ensure_app_source(
        "erpnext", "ERPNext", "https://github.com/frappe/erpnext", version, team
    )
    group_name = frappe.db.get_value("Release Group", {"title": "Rekov ERPNext"}, "name")
    if group_name:
        group = frappe.get_doc("Release Group", group_name)
    else:
        group = frappe.new_doc("Release Group")
        group.title = "Rekov ERPNext"
        group.version = version
        group.team = team
        group.enabled = 1
        group.default = 1
        group.public = 0
        group.append("apps", {"app": "frappe", "source": frappe_source})
        group.append("apps", {"app": "erpnext", "source": erpnext_source})
        group.append("servers", {"server": app_server.name})
        group.insert(ignore_permissions=True)
    if not frappe.db.exists("Release Group Server", {"parent": group.name, "server": app_server.name}):
        group.append("servers", {"server": app_server.name})
    if not frappe.db.exists("Release Group App", {"parent": group.name, "app": "frappe"}):
        group.append("apps", {"app": "frappe", "source": frappe_source})
    if not frappe.db.exists("Release Group App", {"parent": group.name, "app": "erpnext"}):
        group.append("apps", {"app": "erpnext", "source": erpnext_source})
    group.save(ignore_permissions=True)

    # A successful Bench is the only terminal success signal for this stage.
    # Never manufacture a Bench directly: Press creates it from Deploy.
    if frappe.db.exists("Bench", {"group": group.name, "status": "Active"}):
        return group.name

    candidates = frappe.get_all(
        "Deploy Candidate",
        filters={"group": group.name},
        fields=["name", "creation"],
        order_by="creation desc",
        limit_page_length=1,
    )
    if candidates:
        candidate = frappe.get_doc("Deploy Candidate", candidates[0].name)
        builds = frappe.get_all(
            "Deploy Candidate Build",
            filters={"deploy_candidate": candidate.name},
            fields=["name", "status", "deploy_after_build", "creation"],
            order_by="creation desc",
            limit_page_length=1,
        )
        if builds:
            latest_build = builds[0]
            # Pending/Scheduled/Preparing/Running builds, and successful
            # builds whose Deploy/Bench jobs are still converging, must not be
            # duplicated by a later reconcile invocation.
            if latest_build.status in {
                "Scheduled",
                "Pending",
                "Preparing",
                "Running",
                "Success",
            }:
                return group.name

        # A failed candidate is immutable. Create a fresh snapshot and let
        # Press's own build/deploy hooks create the next Bench.
        if not builds or latest_build.status in {"Failure", "Cancelled"}:
            candidate = None
        else:
            return group.name
    else:
        candidate = None

    if candidate is None:
        group.initial_deploy()
    return group.name


def setup_server_if_stale(server, doctype: str, stale_minutes: int = 45) -> None:
    """Retry a Press server setup whose Ansible job stopped converging.

    Press leaves the resource in ``Installing`` while the async Ansible play
    runs. A dead worker or lost callback can leave that state forever, so the
    bootstrap must inspect the latest play instead of treating Installing as
    permanently in progress.
    """
    if server.status == "Active":
        return

    latest_play = frappe.get_all(
        "Ansible Play",
        filters={"server_type": doctype, "server": server.name},
        fields=["name", "status", "start", "end", "creation"],
        order_by="creation desc",
        limit_page_length=1,
    )
    play = latest_play[0] if latest_play else None
    if server.status == "Installing" and play:
        if play.status == "Running" and play.start:
            age_minutes = (now_datetime() - play.start).total_seconds() / 60
            if age_minutes < stale_minutes:
                return
        elif play.status == "Pending":
            reference_time = play.start or play.creation
            if reference_time:
                age_minutes = (now_datetime() - reference_time).total_seconds() / 60
                if age_minutes < stale_minutes:
                    return

    # Pending/Broken, missing plays, failed plays, and stale Installing plays
    # are safe to retry through Press's normal async setup method.
    if server.status != "Pending":
        server.status = "Pending"
        server.save(ignore_permissions=True)
    server.setup_server()


def reconcile(server_name: str) -> str | None:
    """Self-heal server setup and continue Press provisioning."""
    server = frappe.get_doc("Self Hosted Server", server_name)
    if not server.server or not server.database_server:
        return None

    db_server = frappe.get_doc("Database Server", server.database_server)
    app_server = frappe.get_doc("Server", server.server)
    setup_server_if_stale(db_server, "Database Server")
    db_server.reload()

    if db_server.status == "Active":
        setup_server_if_stale(app_server, "Server")
        app_server.reload()

    if db_server.status != "Active" or app_server.status != "Active":
        # A Press worker or Ansible play can disappear without changing the
        # parent Self Hosted Server. Keep reconciliation alive until both
        # child resources converge instead of requiring another Git push.
        frappe.enqueue_in(
            timedelta(minutes=5),
            "press.rekov_press_platform.reconcile",
            server_name=server.name,
            queue="long",
            timeout=2400,
        )
        return None

    team = server.team
    version = ensure_frappe_version()
    return ensure_release_pipeline(team, version, server.name)


def bootstrap() -> dict:
    root_domain = required("PRESS_ROOT_DOMAIN")
    contabo_ip = required("PRESS_TENANT_NODE_PUBLIC_IP")
    ssh_public_key = required("PRESS_SSH_PUBLIC_KEY")

    cloud_provider = ensure_doc(
        "Cloud Provider",
        "Generic",
        {
            "title": "Generic",
            # Press requires an image for Cloud Provider records. The image is
            # presentation-only for a self-hosted provider.
            "image": "/assets/press/oci.png",
        },
    )
    cluster = ensure_doc(
        "Cluster",
        "rekov-hybrid",
        {
            "title": "Rekov Hybrid",
            "cloud_provider": cloud_provider,
            "hybrid": 1,
            "public": 0,
            "status": "Active",
        },
    )
    team = ensure_operator_team()
    ssh_key = ensure_doc(
        "SSH Key",
        "rekov-deploy",
        {"public_key": ssh_public_key, "enabled": 1, "default": 1},
    )
    plan = ensure_doc(
        "Server Plan",
        "rekov-contabo",
        {
            "title": "Rekov Contabo",
            "server_type": "Self Hosted Server",
            "cluster": cluster,
            "enabled": 1,
            "platform": "amd64",
            "cloud_provider": cloud_provider,
            "vcpu": 2,
            "memory": 4096,
            "disk": 50,
            "price_inr": 0,
            "price_usd": 0,
        },
    )
    root = ensure_doc(
        "Root Domain",
        root_domain,
        {
            "default_cluster": cluster,
            "team": team,
            "dns_provider": "Generic",
            "enabled": 1,
        },
    )
    proxy_name = f"rekov-proxy.{root_domain}"
    proxy = ensure_doc(
        "Proxy Server",
        proxy_name,
        {
            "hostname": "rekov-proxy",
            "title": "Rekov tenant proxy",
            "domain": root,
            "cluster": cluster,
            "team": team,
            "provider": "Generic",
            "ip": contabo_ip,
            "private_ip": contabo_ip,
            "ssh_user": "ubuntu",
            "ssh_port": 22,
            "is_self_hosted": 1,
            "is_primary": 1,
            "status": "Pending",
        },
    )
    root_doc = frappe.get_doc("Root Domain", root)
    if root_doc.default_proxy_server != proxy:
        root_doc.default_proxy_server = proxy
        root_doc.save(ignore_permissions=True)

    settings = frappe.get_single("Press Settings")
    settings.domain = root
    settings.cluster = cluster
    settings.hybrid_domain = root
    settings.hybrid_cluster = cluster
    settings.agent_repository_owner = "frappe"
    settings.certbot_directory = "/etc/letsencrypt"
    settings.eff_registration_email = f"admin@{root_domain}"
    settings.save(ignore_permissions=True)
    self_hosted_server = ensure_self_hosted_server(cluster, team, plan, proxy)
    server_doc = frappe.get_doc("Self Hosted Server", self_hosted_server)
    if not server_doc.server or not server_doc.database_server:
        # A failed first bootstrap leaves the Self Hosted Server in
        # ``Unreachable``/``Broken``.  Press's ping method intentionally
        # swallows exceptions, so reset the transient status and inspect the
        # Ansible Play it creates instead of trusting the stale server row.
        server_doc.status = "Pending"
        server_doc.save(ignore_permissions=True)
        try:
            PressAnsible(
                playbook="ping.yml",
                server=server_doc,
                user=server_doc.ssh_user or "root",
                port=server_doc.ssh_port or 22,
            ).run()
        except Exception as exc:
            raise RuntimeError(
                "Press could not execute the tenant node Ansible ping: "
                f"{type(exc).__name__}: {exc}"
            ) from exc
        server_doc.reload()
        ping_play = frappe.get_all(
            "Ansible Play",
            filters={"server": server_doc.name, "play": "Ping Server"},
            fields=["name", "status"],
            order_by="creation desc",
            limit_page_length=1,
        )
        if not ping_play or ping_play[0].status != "Success":
            play_status = ping_play[0].status if ping_play else "not created"
            raise RuntimeError(
                "Press could not complete the tenant node Ansible ping "
                f"(Ansible Play: {play_status}). Check the Ansible Play log."
            )
        if not server_doc.database_server:
            server_doc.create_database_server()
        server_doc.reload()
        if not server_doc.server:
            server_doc.create_application_server()
        server_doc.reload()
    if server_doc.server and server_doc.database_server:
        db_server = frappe.get_doc("Database Server", server_doc.database_server)
        app_server = frappe.get_doc("Server", server_doc.server)
        setup_server_if_stale(db_server, "Database Server")
        # On a hybrid server Press normally invokes this from the database
        # setup callback. Reconcile it explicitly as well, so a lost callback
        # cannot leave the application server Pending forever.
        if db_server.status == "Active":
            setup_server_if_stale(app_server, "Server")
        ensure_frappe_version()
        ensure_release_pipeline(team, "Version 16", self_hosted_server)
        frappe.enqueue(
            "press.rekov_press_platform.reconcile",
            server_name=self_hosted_server,
            queue="long",
            timeout=2400,
            enqueue_after_commit=True,
        )
    frappe.db.commit()

    return {
        "root_domain": root,
        "cluster": cluster,
        "team": team,
        "ssh_key": ssh_key,
        "self_hosted_plan": plan,
        "proxy": proxy,
        "tenant_node_ip": contabo_ip,
        "self_hosted_server": self_hosted_server,
    }
