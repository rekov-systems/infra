"""Idempotent foundation for a Rekov self-hosted Press control plane.

Run with ``bench --site <control-site> execute press.rekov_press_platform.bootstrap``.
Configuration is passed through environment variables by deploy.sh; tenant
domains and public IPs are never hard-coded in this module.
"""

from __future__ import annotations

import os

import frappe


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
    """Create the first ERPNext release group once the app server is ready."""
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

    has_deployment = frappe.db.exists("Bench", {"group": group.name}) or frappe.db.exists(
        "Deploy Candidate", {"group": group.name}
    )
    if not has_deployment:
        group.initial_deploy()
    return group.name


def reconcile(server_name: str) -> str | None:
    """Finish the native Press setup after queued server jobs become active."""
    server = frappe.get_doc("Self Hosted Server", server_name)
    if not server.server:
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
        server_doc.ping_ansible()
        server_doc.reload()
        if server_doc.status in ("Pending", "Active"):
            if not server_doc.database_server:
                server_doc.create_database_server()
            server_doc.reload()
            if not server_doc.server:
                server_doc.create_application_server()
            server_doc.reload()
    if server_doc.server and server_doc.database_server:
        db_server = frappe.get_doc("Database Server", server_doc.database_server)
        app_server = frappe.get_doc("Server", server_doc.server)
        if db_server.status not in ("Active", "Installing"):
            db_server.setup_server()
        if server_doc.different_database_server and app_server.status not in ("Active", "Installing"):
            app_server.setup_server()
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
