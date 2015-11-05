package org.fao.geonet.harvester.wfsfeatures;

import org.apache.camel.Exchange;
import org.apache.camel.LoggingLevel;
import org.apache.camel.builder.RouteBuilder;
import org.w3c.dom.Document;

/**
 * Created by francois on 28/10/15.
 */
public class HarvesterRouteBuilder extends RouteBuilder {
    private static final String LOGGER_NAME = "harvester.wfsfeature";

    @Override
    public void configure() throws Exception {
        final String url = "http://geoservices.brgm.fr/risques?SERVICE=WFS&VERSION=1.0.0&REQUEST=GetFeature&TYPENAME=BASIAS_LOCALISE&maxFeatures=10000";

//        final String url = "http4://geoservices.brgm.fr/risques?SERVICE=WFS&VERSION=1.0.0&REQUEST=GetFeature&TYPENAME=BASIAS_LOCALISE&maxFeatures=10000";
        //http://visi-sextant.ifremer.fr/cgi-bin/sextant/wfs/bgmb?REQUEST=GetFeature&SERVICE=WFS&VERSION=1.1.0&TypeName=SISMER_prelevements&maxFeatures=100 [

        from("timer://start?repeatCount=1").autoStartup(true)
                .log(LoggingLevel.DEBUG, LOGGER_NAME, "Harvesting ${body.url} one time.")
                .setHeader(Exchange.HTTP_URI, simple(url))
                .setProperty("mduuid", simple(""))
                .setProperty("linkage", simple("test"))
                .to("direct:index-wfs");

        from("spring-event:default")
                .filter(body().startsWith("http"))
                .log(LoggingLevel.DEBUG, LOGGER_NAME, "${body.url}")
                .setHeader("Exchange.HTTP_URI", simple("${body.url}"))
                .setProperty("mduuid", simple("${body.uuid}"))
                .setProperty("linkage", simple("${body.linkage}"))
                .setBody(simple(""))
                .to("direct:index-wfs");

        // TODO drop feature before adding new one ?
        from("direct:index-wfs")
                .to("http4://wfs-server-url")
                .convertBodyTo(Document.class)
                .split()
                    .xpath("//gml:featureMember/*|//wfs2:member/*", WfsNamespaces.wfsNamespaces.getNamespaces())
                    .parallelProcessing()
                    .bean(FeatureIndexer.class, "featureToIndexDocument");
    }
}
