#!/usr/bin/env python3
"""Register and provision Press infrastructure through native Press doctypes."""

from __future__ import annotations

import os
import time

import frappe
from press.api.server import plans


def required(name: str) -> str:

    value = os.environ.get(name, "").strip()
    if not value:
        raise RuntimeError(f"Missing native Press input: {name}")
    return value


def wait_status(doctype: str, name: str, active: str = "Active", timeout: int = 2400) -> None:

    deadline = time.time() + timeout
    while time.time() < deadline:
        doc = frappe.get_doc(doctype, name)
        if doc.status == active:
            return
        if doc.status in {"Broken", "Failure", "Archived"}:
            raise RuntimeError(f"{doctype} {name} entered terminal status {doc.status}")
        time.sleep(10)
    raise TimeoutError(f"Timed out waiting for {doctype} {name} to become {active}")


site = required("PRESS_CONTROL_HOSTNAME")
root_domain = required("PRESS_ROOT_DOMAIN")
cluster_name = os.environ.get("PRESS_NATIVE_CLUSTER", "rekov-hybrid").strip()
team_name = os.environ.get("PRESS_NATIVE_TEAM", "").strip()
server_title = os.environ.get("PRESS_NATIVE_SERVER_TITLE", "erp-prod-01").strip()

frappe.init(site=site, sites_path="/home/frappe/press-bench/sites")
frappe.connect()
try:
    if not team_name:
        teams = frappe.get_all("Team", {"enabled": 1}, pluck="name", limit_page_length=2)
        if len(teams) != 1:
            raise RuntimeError("Set PRESS_NATIVE_TEAM: Press must have exactly one active team for bootstrap")
        team_name = teams[0]

    team = frappe.get_doc("Team", team_name)
    if not team.enabled:
        raise RuntimeError(f"Press team {team_name} is disabled")
    if not getattr(team, "self_hosted_servers_enabled", 0):
        team.self_hosted_servers_enabled = 1
        team.save(ignore_permissions=True)

    cluster = frappe.db.exists("Cluster", cluster_name)
    if not cluster:
        cluster = frappe.get_doc(
            {
                "doctype": "Cluster",
                "name": cluster_name,
                "title": cluster_name,
                "cloud_provider": "Generic",
                "hybrid": 1,
                "public": 1,
                "status": "Active",
            }
        ).insert(ignore_permissions=True).name
    else:
        cluster = frappe.get_doc("Cluster", cluster)
        if not cluster.hybrid:
            cluster.hybrid = 1
            cluster.save(ignore_permissions=True)
        cluster = cluster.name

    if not frappe.db.exists("Root Domain", root_domain):
        frappe.get_doc(
            {
                "doctype": "Root Domain",
                "name": root_domain,
                "dns_provider": "Generic",
                "default_cluster": cluster,
                "team": team_name,
                "enabled": 1,
            }
        ).insert(ignore_permissions=True)

    frappe.db.set_single_value("Press Settings", "hybrid_domain", root_domain)

    certificate_name = f"*.{root_domain}"
    certificate_path = os.environ.get("PRESS_TLS_CERTIFICATE", "/home/frappe/.config/rekov/root-cert.pem")
    full_chain_path = os.environ.get("PRESS_TLS_FULL_CHAIN", "/home/frappe/.config/rekov/root-fullchain.pem")
    private_key_path = os.environ.get("PRESS_TLS_PRIVATE_KEY", "/home/frappe/.config/rekov/root-privkey.pem")
    certificate = frappe.db.exists("TLS Certificate", certificate_name)
    if not certificate or frappe.db.get_value("TLS Certificate", certificate_name, "status") != "Active":
        certificate = frappe.get_doc(
            {
                "doctype": "TLS Certificate",
                "name": certificate_name,
                "domain": root_domain,
                "wildcard": 1,
                "provider": "Other",
                "team": team_name,
                "certificate": open(certificate_path).read(),
                "full_chain": open(full_chain_path).read(),
                "private_key": open(private_key_path).read(),
                "status": "Active",
            }
        ).insert(ignore_permissions=True).name

    available_plans = plans("Self Hosted Server").get("plans", [])
    plan_name = os.environ.get("PRESS_NATIVE_PLAN", "").strip()
    if not plan_name:
        plan_name = available_plans[0]["name"] if available_plans else ""
    if not plan_name:
        raise RuntimeError("No native Press Self Hosted Server plan is available")

    existing = frappe.get_all(
        "Self Hosted Server",
        {"title": server_title, "team": team_name, "status": ["!=", "Archived"]},
        pluck="name",
        limit_page_length=1,
    )
    if existing:
        self_hosted = frappe.get_doc("Self Hosted Server", existing[0])
    else:
        self_hosted = frappe.get_doc(
            {
                "doctype": "Self Hosted Server",
                "title": server_title,
                "team": team_name,
                "cluster": cluster,
                "plan": plan_name,
                "database_plan": plan_name,
                "new_server": 1,
                "different_database_server": 1,
                "dedicated_proxy": 1,
                "ip": required("PRESS_TENANT_NODE_PUBLIC_IP"),
                "private_ip": required("PRESS_TENANT_NODE_PRIVATE_IP"),
                "mariadb_ip": required("PRESS_TENANT_NODE_PUBLIC_IP"),
                "mariadb_private_ip": required("PRESS_TENANT_NODE_PRIVATE_IP"),
                "proxy_public_ip": required("PRESS_PROXY_NODE_PUBLIC_IP"),
                "proxy_private_ip": required("PRESS_PROXY_NODE_PRIVATE_IP"),
                "ssh_user": os.environ.get("PRESS_MANAGED_SSH_USER", "ubuntu"),
                "ssh_port": 22,
                "mariadb_root_password": required("PRESS_DB_ROOT_PASSWORD"),
            }
        ).insert(ignore_permissions=True)

    if not self_hosted.proxy_created:
        self_hosted.create_proxy_server()
        self_hosted.reload()

    proxy = frappe.get_doc("Proxy Server", self_hosted.proxy_server)
    if proxy.status != "Active":
        proxy.setup_server()
        frappe.db.commit()
        wait_status("Proxy Server", proxy.name)

    self_hosted.reload()
    if not self_hosted.database_setup:
        self_hosted.create_database_server()
        self_hosted.reload()
    if not self_hosted.server_created:
        self_hosted.create_application_server()
        self_hosted.reload()

    self_hosted.start_setup = 1
    self_hosted.save(ignore_permissions=True)
    self_hosted.setup_server()
    frappe.db.commit()

    wait_status("Database Server", self_hosted.database_server)
    wait_status("Server", self_hosted.server)
    print(
        f"Native Press infrastructure active: cluster={cluster} proxy={proxy.name} "
        f"database={self_hosted.database_server} server={self_hosted.server}"
    )
finally:
    frappe.destroy()
