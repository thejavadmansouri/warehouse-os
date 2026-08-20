package com.warehouseos.operator.data.network

import android.content.Context
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import dagger.hilt.android.qualifiers.ApplicationContext
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Whether the phone is on a connection the bulk transfers may use.
 *
 * The rule is Wi-Fi vs SIM data — the one the worker was actually told. It is
 * deliberately NOT Android's "unmetered" flag: that is a heuristic, and it is
 * wrong in exactly the cases that matter here. A phone hotspot reports metered,
 * so does any router someone has ticked "metered" on, and a warehouse Wi-Fi with
 * no internet uplink can fail validation entirely. Gating on it leaves the worker
 * permanently blocked, staring at "connect to Wi-Fi" while connected to Wi-Fi.
 *
 * Ethernet counts too: a docked terminal is not on anyone's data plan.
 */
@Singleton
class NetworkStatus @Inject constructor(
    @ApplicationContext private val context: Context,
) {
    /** True on Wi-Fi or Ethernet. False on mobile data and when offline. */
    fun isOnWifi(): Boolean {
        val manager = context.getSystemService(ConnectivityManager::class.java) ?: return false
        val capabilities = manager.getNetworkCapabilities(manager.activeNetwork) ?: return false
        return capabilities.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) ||
            capabilities.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET)
    }
}
