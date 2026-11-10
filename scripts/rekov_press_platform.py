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
    frappe.db.commit()

    return {
        "root_domain": root,
        "cluster": cluster,
        "team": team,
        "ssh_key": ssh_key,
        "self_hosted_plan": plan,
        "proxy": proxy,
        "tenant_node_ip": contabo_ip,
    }
